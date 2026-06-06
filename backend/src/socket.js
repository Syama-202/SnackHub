// Socket.IO on the API's HTTP server (doc 13): live change hints for every portal, on
// /api/v1/socket. The same checks as the REST routes run once per connection: the signed
// access token, the account and the role still active, two-step sign-in where the role needs
// it, and the admin host for staff rooms. Rooms come from the token alone and the server never
// accepts a request to join one, so a customer hears only about their own orders, a shop only
// about its orders, a rider only about their offers and deliveries. Events carry ids, never
// data (utils/realtime.js). With Redis every API process shares the rooms (redis-adapter).
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyAccessToken } from './utils/tokens.js';
import { createLimiter } from './utils/rateLimit.js';
import { adapterClients } from './utils/redis.js';
import { realtime, roomOf, personRoom, STAFF_ROOMS } from './utils/realtime.js';
import { userModel } from './models/identity/user.js';
import { userRoleModel } from './models/identity/userRole.js';
import { can, mfaRequiredFor, STAFF_ROLES } from '../../shared/domain/permissions.js';

export const SOCKET_PATH = '/api/v1/socket';
// the apps send nothing on the socket; a client that keeps sending is dropped
const MAX_INBOUND = 20;

const refuse = (code, message) => Object.assign(new Error(message), { data: { code } });

// the caller's address as Express sees it with trust proxy 1: the last X-Forwarded-For hop
const ipOf = (handshake) => {
  const xff = handshake.headers['x-forwarded-for'];
  return xff ? String(xff).split(',').at(-1).trim() : handshake.address;
};

export function createSocketServer(httpServer, { env, dbs, logger, redis = null, rateStore }) {
  const io = new Server(httpServer, {
    path: SOCKET_PATH,
    serveClient: false,
    cors: { origin: env.CORS_ORIGINS },
    maxHttpBufferSize: 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });
  // shared rooms across processes; Redis being down (even at start) never stops the API
  const clients = redis ? adapterClients(redis) : null;
  if (clients) io.adapter(createAdapter(clients.pub, clients.sub));

  const connections = createLimiter({ name: 'socket.connect.ip', windowMs: 60_000, max: 30, store: rateStore });

  io.use(async (socket, next) => {
    try {
      const { handshake } = socket;
      if (!(await connections.hit(ipOf(handshake))).ok) throw refuse('RATE_LIMITED', 'Too many connections. Wait a minute.');
      let user;
      try {
        user = verifyAccessToken(env, String(handshake.auth?.token ?? ''));
      } catch {
        throw refuse('UNAUTHENTICATED', 'Your sign-in has expired');
      }
      const [account, membership] = await Promise.all([userModel.findById(dbs.identity, user.userId), userRoleModel.find(dbs.identity, user.userId, user.role)]);
      if (!account || account.status !== 'active') throw refuse('ACCOUNT_SUSPENDED', 'This account is suspended');
      if (!membership || membership.status !== 'active') throw refuse('FORBIDDEN', 'Your role cannot do this');
      if (mfaRequiredFor(user.role, env.MFA_REQUIRED_ROLES) && !user.mfaAt) throw refuse('MFA_REQUIRED', 'Set up two-step sign-in to continue');
      const rooms = [roomOf(user), personRoom(user.userId)];
      if (STAFF_ROLES.includes(user.role)) {
        // staff events only on the admin host, as for the /admin routes. Netlify cannot carry
        // sockets, so the hosted admin console connects straight to the API; its page origin
        // (the browser sets it on the handshake) stands in for the host. The staff token with a
        // second factor is still required either way.
        const adminOrigin = (() => {
          try {
            return new URL(env.ADMIN_CONSOLE_URL).origin;
          } catch {
            return null;
          }
        })();
        const fromAdminPage = env.NODE_ENV === 'production' && Boolean(env.PROXY_SIGNING_SECRET) && handshake.headers.origin === adminOrigin;
        const onAdminHost = env.ADMIN_HOSTS.includes(handshake.headers.host) || fromAdminPage || (env.NODE_ENV !== 'production' && handshake.auth?.host === 'admin');
        if (!onAdminHost) throw refuse('FORBIDDEN', 'Your role cannot do this');
        for (const [room, permission] of Object.entries(STAFF_ROOMS)) if (can(user.role, permission)) rooms.push(roomOf(room));
      }
      socket.data = { userId: user.userId, role: user.role, rooms, exp: user.exp };
      next();
    } catch (err) {
      next(err.data ? err : refuse('UNAVAILABLE', 'Live updates are unavailable right now'));
    }
  });

  io.on('connection', (socket) => {
    const { rooms, exp, role } = socket.data;
    socket.join(rooms);
    // access tokens are short-lived: the socket closes when this one expires and the app
    // reconnects with a fresh token (and the checks above run again)
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, exp - Date.now()));
    let inbound = 0;
    socket.onAny(() => {
      inbound += 1;
      if (inbound > MAX_INBOUND) socket.disconnect(true);
    });
    socket.on('disconnect', () => clearTimeout(expiry));
    socket.emit('ready', { role });
  });

  const stop = realtime.use({
    send: (rooms, event) => io.to(rooms).emit('change', event),
    kick: (room) => io.in(room).disconnectSockets(true),
  });

  return {
    io,
    async close() {
      stop();
      await io.close();
      clients?.close();
    },
  };
}

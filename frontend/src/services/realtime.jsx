// Live updates over Socket.IO (/api/v1/socket). The server sends hints only, { id, topic,
// orderId? }, and pages fetch the change over REST as always, so the socket never carries
// order data or the delivery code.
//
// The socket reconnects by itself after a network drop. When the server closes it (the access
// token expired, or the account was suspended), the token is refreshed first and it tries
// again with growing pauses; a refused sign-in stops it. While it is down, pages keep polling
// at their normal pace (usePolling); while it is live they poll only as a safety net.
import { API_URL, getAccessToken, getApiHost, refreshAccessToken } from './api';

const RETRY_MAX_MS = 30_000;
// refusals a fresh token cannot fix
const FINAL = new Set(['ACCOUNT_SUSPENDED', 'FORBIDDEN', 'MFA_REQUIRED']);
const SEEN_MAX = 300;

let socket = null;
// bumps on every start and stop, so a start overtaken by a stop never opens a socket
let generation = 0;
let status = 'off'; // off | connecting | live | down
let retries = 0;
let retryTimer = null;
const statusListeners = new Set();
const topicListeners = new Map();
const seen = new Set();

function setStatus(next) {
  if (status === next) return;
  status = next;
  for (const fn of statusListeners) fn();
}

const emit = (topic, event) => {
  for (const fn of topicListeners.get(topic) ?? []) fn(event);
};

function endpoint() {
  // hosted: the sites proxy /api through Netlify, which cannot carry sockets, so live updates
  // go straight to the API (VITE_SOCKET_URL, e.g. https://snackhub-api.onrender.com)
  const direct = import.meta.env.VITE_SOCKET_URL;
  if (direct) return { url: new URL(direct).origin, path: '/api/v1/socket' };
  if (/^https?:\/\//.test(API_URL)) {
    const u = new URL(API_URL);
    return { url: u.origin, path: `${u.pathname.replace(/\/$/, '')}/socket` };
  }
  return { url: undefined, path: `${API_URL}/socket` };
}

function retryLater({ refresh }) {
  clearTimeout(retryTimer);
  const wait = Math.min(RETRY_MAX_MS, 1000 * 2 ** retries) * (0.75 + Math.random() / 2);
  retries += 1;
  retryTimer = setTimeout(async () => {
    if (!socket) return;
    // a new token first; signed out meanwhile means there is nothing to come back to
    if (refresh && !(await refreshAccessToken().catch(() => null)) && !getAccessToken()) return stopRealtime();
    socket?.connect();
  }, wait);
}

/**
 * Connects for the signed-in account; does nothing when already connected.
 * The client library loads only now, so visitors who never sign in do not download it.
 */
export async function startRealtime() {
  const token = getAccessToken();
  if (socket || !token) return;
  const mine = ++generation;
  setStatus('connecting');
  const { io } = await import('socket.io-client');
  if (mine !== generation || socket) return;
  const { url, path } = endpoint();
  socket = io(url, {
    path,
    // the token is read on every (re)connection, so a refreshed one is used
    auth: (cb) => cb({ token: getAccessToken() ?? '', ...(getApiHost() ? { host: getApiHost() } : {}) }),
    transports: ['websocket'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: RETRY_MAX_MS,
    randomizationFactor: 0.5,
  });
  socket.on('ready', () => {
    retries = 0;
    setStatus('live');
    // anything missed while away: every listener reads once
    for (const topic of topicListeners.keys()) emit(topic, { topic, resync: true });
  });
  socket.on('change', (event) => {
    // one event reaches a page once, even if it arrives twice
    if (!event?.id || seen.has(event.id)) return;
    seen.add(event.id);
    if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value);
    emit(event.topic, event);
  });
  socket.on('disconnect', (reason) => {
    setStatus('down');
    // the server closed it on purpose (token expired, suspended): Socket.IO will not come back alone
    if (reason === 'io server disconnect') retryLater({ refresh: true });
  });
  socket.on('connect_error', (err) => {
    setStatus('down');
    const code = err?.data?.code;
    if (FINAL.has(code)) return stopRealtime();
    // a refusal from the server is not retried by Socket.IO; a network error is
    if (!socket?.active) retryLater({ refresh: code === 'UNAUTHENTICATED' });
  });
}

/** Disconnects and forgets the session (sign-out, switching account). */
export function stopRealtime() {
  generation += 1;
  clearTimeout(retryTimer);
  retries = 0;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  seen.clear();
  setStatus('off');
}

/** Calls fn(event) for each hint on one of the topics; returns a function that stops it. */
export function onTopics(topics, fn) {
  for (const t of topics) {
    if (!topicListeners.has(t)) topicListeners.set(t, new Set());
    topicListeners.get(t).add(fn);
  }
  return () => {
    for (const t of topics) topicListeners.get(t)?.delete(fn);
  };
}

export const realtimeStatus = () => status;
export function subscribeStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

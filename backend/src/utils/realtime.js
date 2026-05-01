// Live change hints for the apps (doc 13, Socket.IO). An event only says what changed and
// where to look: { id, topic, orderId?, at }. The app then reads it over the normal REST
// routes, which check role and ownership as always, so no order data, address or delivery
// code ever travels on a socket, and a missed event costs at most one poll interval.
//
// Rooms come from the signed token alone (socket.js): one per person and portal, and staff
// rooms for those whose role grants the permission. Nobody can ask to join a room.
import { randomUUID } from 'node:crypto';

// staff rooms and the permission that admits a socket to each
export const STAFF_ROOMS = { ops: 'operations.read', complaints: 'complaints.read' };

/** The room of one person in one portal ({ userId, role }), or a staff room by name. */
export const roomOf = (to) => (typeof to === 'string' ? `staff:${to}` : `u:${to.userId}:${to.role}`);
/** Every socket of one person, whatever the portal: used to close them on suspension. */
export const personRoom = (userId) => `p:${userId}`;

const sinks = new Set();

export const realtime = {
  /** A transport (the Socket.IO server or the Redis emitter); returns a function that removes it. */
  use(sink) {
    sinks.add(sink);
    return () => sinks.delete(sink);
  },
  get active() {
    return sinks.size > 0;
  },
  /**
   * Sends one hint to each recipient: { userId, role } objects and staff room names; empty
   * entries are skipped. Never throws and never waits: the change itself is already saved.
   */
  publish(to, topic, extra = {}) {
    if (!sinks.size) return;
    const rooms = [...new Set(to.filter(Boolean).filter((t) => typeof t === 'string' || t.userId).map(roomOf))];
    if (!rooms.length) return;
    const event = { id: randomUUID(), topic, ...(extra.orderId ? { orderId: Number(extra.orderId) } : {}), at: Date.now() };
    for (const sink of sinks) {
      try {
        sink.send(rooms, event);
      } catch {
        // best effort: the apps still poll
      }
    }
  },
  /** Closes every live socket of a person (suspended account or role); they must sign in again. */
  kick(userId) {
    for (const sink of sinks) {
      try {
        sink.kick?.(personRoom(userId));
      } catch {
        // as above
      }
    }
  },
};

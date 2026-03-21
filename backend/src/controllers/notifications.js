// The in-app inbox (doc 10.6) for any signed-in person. The relay fills it from the order
// outbox; a message never contains the delivery code.
//   GET  /me/notifications        the latest 50
//   POST /me/notifications/read   mark all read
import { notificationModel } from '../models/notify/notification.js';

const ms = (d) => (d ? new Date(d).getTime() : null);
const view = (n) => ({ id: n.id, orderId: n.order_id, type: n.type, body: n.body, readAt: ms(n.read_at), createdAt: ms(n.created_at) });

export function notificationsController({ dbs }) {
  async function list(req, res) {
    res.json((await notificationModel.listForUser(dbs.notify, req.user.userId, 50, req.user.role)).map(view));
  }

  async function readAll(req, res) {
    await notificationModel.markAllRead(dbs.notify, req.user.userId, req.user.role);
    res.json({ ok: true });
  }

  return { list, readAll };
}

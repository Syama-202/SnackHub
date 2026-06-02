// Sends the emails, texts and inbox messages (with their push copies) waiting in the module outboxes (doc 12.1). Each row is claimed
// with FOR UPDATE SKIP LOCKED, sent, then marked published in the same transaction; a failed
// send waits longer each time (1, 2, 4 ... minutes) and gives up after 8 tries. The message
// id is the outbox row, so a retry that did reach the provider is recognisable there. The
// sealed part (links, codes) is opened only here, at the moment of sending.
import { open } from '../utils/keys.js';
import { render } from '../utils/emails.js';
import { outboxModel } from '../models/outbox.js';
import { notificationModel, portalOfType } from '../models/notify/notification.js';
import { realtime } from '../utils/realtime.js';
import { pushToDevices } from '../utils/push.js';

const MODULES = ['identity', 'catalog', 'dispatch', 'ordering'];

export function createOutboxRelay({ env, dbs, mailer, sms, push, logger }) {
  // inbox messages need no provider, so they always go out
  const types = () => ['notify.inbox', ...(mailer.enabled ? ['email.send', 'admin.alert'] : []), ...(sms.enabled ? ['sms.send'] : [])];

  async function adminEmails() {
    return dbs.identity('users').join('user_roles', 'user_roles.user_id', 'users.id').where({ 'user_roles.role': 'admin', 'user_roles.status': 'active', 'users.status': 'active' }).pluck('users.email');
  }

  async function deliver(module, row) {
    const p = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const messageId = `<outbox-${module}-${row.id}@snackhub.local>`;
    const name = `${p.template ?? row.type}-${module}-${row.id}`;
    if (row.type === 'notify.inbox') {
      // the unique (order, type, person) key makes a second delivery of the same row harmless
      const created = await notificationModel.create(dbs.notify, { userId: p.userId, orderId: p.orderId ?? null, type: p.type, body: p.body });
      // the bell (and the seller's and rider's boards) refresh at once; a re-delivery says nothing
      // and the person's phones and computers that asked for push; only for a new message
      if (created) {
        realtime.publish([{ userId: p.userId, role: portalOfType(p.type) }], 'notification', { orderId: p.orderId });
        await pushToDevices(dbs, push, { userId: p.userId, portal: portalOfType(p.type), message: p });
      }
      return;
    }
    if (row.type === 'admin.alert') {
      const to = await adminEmails();
      if (!to.length) return;
      const text = `SnackHub admin alert: ${p.type} for user ${p.userId}${p.orderId ? ` on order #${p.orderId}` : ''}${p.left !== undefined ? ` (${p.left} recovery codes left)` : ''}. Check the audit log.`;
      await mailer.send({ to, subject: `Admin alert: ${p.type.replaceAll('_', ' ')}`, text, messageId, name });
      return;
    }
    const secret = p.sealed ? JSON.parse(open(env, 'outbox', p.sealed)) : {};
    const msg = render(p.template, { ...p.data, ...secret });
    if (row.type === 'email.send') await mailer.send({ to: p.to, subject: msg.subject, text: msg.text, html: msg.html ?? undefined, messageId, name });
    else await sms.send({ to: p.to, body: msg.text, messageId, name });
  }

  /** One pass over every outbox; returns how many messages went out. */
  async function runOnce() {
    const wanted = types();
    if (!wanted.length) return 0;
    let sent = 0;
    for (const module of MODULES) {
      await dbs[module].transaction(async (trx) => {
        const rows = await outboxModel.claimDue(trx, wanted, { limit: 20 });
        for (const row of rows) {
          try {
            await deliver(module, row);
            await outboxModel.markPublished(trx, [row.id]);
            sent += 1;
          } catch (err) {
            // no addresses or message text in the log, only which row and why
            logger?.warn({ outboxId: row.id, module, type: row.type, reason: err.code ?? err.responseCode ?? 'SEND_FAILED' }, 'outbox delivery failed');
            await outboxModel.retryLater(trx, row.id, row.attempts);
          }
        }
      });
    }
    return sent;
  }

  let timer = null;
  let running = false;
  return {
    runOnce,
    start(everyMs = 3000) {
      timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
          await runOnce();
        } catch (err) {
          logger?.error({ reason: err.code ?? err.message }, 'outbox relay pass failed');
        } finally {
          running = false;
        }
      }, everyMs);
      timer.unref?.();
    },
    stop: () => clearInterval(timer),
  };
}

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
import { describeError, recordError } from '../utils/errors.js';
import { shouldRunPass } from '../utils/activity.js';
import { syncSearch } from '../utils/searchSync.js';

// a message is tried this many times, 1, 2, 4 ... 64 minutes apart (about two hours in all)
export const MAX_ATTEMPTS = 8;

const MODULES = ['identity', 'catalog', 'dispatch', 'ordering'];

export function createOutboxRelay({ env, dbs, mailer, sms, push, logger, elastic = null }) {
  // inbox messages and search-index updates need no provider, so they always go out (a search
  // update with no Elasticsearch is simply done)
  const types = () => ['notify.inbox', 'search.sync', ...(mailer.enabled ? ['email.send', 'admin.alert'] : []), ...(sms.enabled ? ['sms.send'] : [])];

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
    if (row.type === 'search.sync') {
      await syncSearch({ dbs, elastic }, p);
      return;
    }
    if (row.type === 'admin.alert') {
      const to = await adminEmails();
      if (!to.length) return;
      // a recorded error carries its own (already scrubbed) summary
      const text = p.type === 'rider_silent' ? `SnackHub admin alert: the rider on order #${p.orderId} has sent no position for several minutes. Open Live operations in the admin console and call the rider or the customer.` : p.summary ? `SnackHub admin alert: ${p.summary}. Open the Errors page in the admin console (error #${p.errorId}).` : `SnackHub admin alert: ${p.type} for user ${p.userId}${p.orderId ? ` on order #${p.orderId}` : ''}${p.left !== undefined ? ` (${p.left} recovery codes left)` : ''}. Check the audit log.`;
      await mailer.send({ to, subject: p.summary ? `Admin alert: error #${p.errorId}` : `Admin alert: ${p.type.replaceAll('_', ' ')}`, text, messageId, name });
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
    const gaveUp = [];
    for (const module of MODULES) {
      await dbs[module].transaction(async (trx) => {
        const rows = await outboxModel.claimDue(trx, wanted, { limit: 20, maxAttempts: MAX_ATTEMPTS });
        for (const row of rows) {
          try {
            await deliver(module, row);
            await outboxModel.markPublished(trx, [row.id]);
            sent += 1;
          } catch (err) {
            // no addresses or message text in the log, only which row and why
            logger?.warn({ outboxId: row.id, module, type: row.type, reason: err.code ?? err.responseCode ?? 'SEND_FAILED' }, 'outbox delivery failed');
            await outboxModel.retryLater(trx, row.id, row.attempts);
            // the last try: it will not be sent again, so it goes on the Errors page (and alerts
            // the admins) instead of sitting unseen in the table
            if (row.attempts + 1 >= MAX_ATTEMPTS) gaveUp.push({ module, id: row.id, type: row.type, reason: err.code ?? err.responseCode ?? 'SEND_FAILED' });
          }
        }
      });
    }
    // recorded after the transactions, so a failure to record never undoes a delivery
    for (const g of gaveUp) {
      logger?.error({ outboxId: g.id, module: g.module, type: g.type, reason: g.reason }, 'outbox message given up on');
      // an alert that could not be sent is only logged: recording it would queue another alert
      if (g.type === 'admin.alert') continue;
      await recordError(dbs, { source: 'job', kind: 'OutboxGaveUp', message: `A ${g.type} message could not be delivered after ${MAX_ATTEMPTS} tries (${g.reason})`, where: `outbox ${g.module}`, release: env.RELEASE }, { logger });
    }
    return sent;
  }

  let timer = null;
  let running = false;
  let lastPassAt = 0;
  return {
    runOnce,
    start(everyMs = 3000) {
      timer = setInterval(async () => {
        // a quiet site checks every half hour instead, so the database can sleep (utils/activity.js)
        if (running || !shouldRunPass(lastPassAt)) return;
        lastPassAt = Date.now();
        running = true;
        try {
          await runOnce();
        } catch (err) {
          logger?.error({ reason: err.code ?? err.message }, 'outbox relay pass failed');
          recordError(dbs, { source: 'job', ...describeError(err), where: 'outbox relay', release: env.RELEASE }, { logger });
        } finally {
          running = false;
        }
      }, everyMs);
      timer.unref?.();
    },
    /** Stops the clock and waits for a pass that is under way, so shutdown never cuts a send in half. */
    async stop() {
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 50));
    },
  };
}

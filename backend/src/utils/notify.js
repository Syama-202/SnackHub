// Queues an email or a text in a module's outbox, inside the caller's transaction, so the
// message exists exactly when the change that caused it does. jobs/outboxRelay.js sends it.
// Values that would let someone act (links with a token, one-time codes) go in `secret`,
// which is sealed with AES-GCM while it waits; everything else is plain.
import { outboxModel } from '../models/outbox.js';
import { seal } from './keys.js';

function queue(env, trx, type, { dedupeKey = null, secret = null, ...rest }) {
  const payload = { ...rest, ...(secret ? { sealed: seal(env, 'outbox', JSON.stringify(secret)) } : {}) };
  return dedupeKey ? outboxModel.addOnce(trx, type, dedupeKey, payload) : outboxModel.add(trx, type, payload).then(() => true);
}

/** template: a key of utils/emails.js TEMPLATES; data and secret fill it in. */
export const queueEmail = (env, trx, { template, to, data = {}, secret, dedupeKey }) => queue(env, trx, 'email.send', { template, to, data, secret, dedupeKey });

export const queueSms = (env, trx, { template, to, data = {}, secret, dedupeKey }) => queue(env, trx, 'sms.send', { template, to, data, secret, dedupeKey });

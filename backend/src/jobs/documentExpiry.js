// Document expiry, run on a schedule (every few hours by the API, or `npm run jobs` from cron).
// For approved sellers and riders it:
// - reminds the person 30, 7 and 1 days before a required or optional document expires, and
//   once on the day it has expired (each reminder at most once: dedupe key + reminded_days)
// - refreshes docs_valid_until on the shop or rider row, so an expired licence hides the shop
//   and keeps the rider out of every assignment, whatever the job's timing
// - takes riders offline whose required documents have lapsed
// A MySQL named lock keeps two API processes from running it at the same time.
import { queueEmail } from '../utils/notify.js';
import { KINDS, kindDb, refreshValidity } from '../utils/applicants.js';
import { userModel } from '../models/identity/user.js';
import { riderModel } from '../models/dispatch/rider.js';
import { DOC_TYPES, EXPIRY_WARN_DAYS, EXPIRY_REMIND_AT, daysUntil, validApproved } from '../../../shared/domain/documents.js';

/** The reminder a document is due: 30, 7 or 1 days ahead, 0 once expired, or null. */
export function reminderDue(daysLeft) {
  if (daysLeft < 0) return 0;
  const due = [...EXPIRY_REMIND_AT].sort((a, b) => a - b).find((t) => daysLeft <= t);
  return due ?? null;
}

export async function runDocumentExpiry({ env, dbs, logger, now = Date.now() }) {
  // a named lock belongs to one connection, so it is taken and released inside one transaction
  return dbs.identity.transaction(async (lockConn) => {
    const [[lock]] = await lockConn.raw("SELECT GET_LOCK('snackhub.document_expiry', 0) AS got");
    if (!lock.got) return { skipped: true };
    try {
      return await expiryPass({ env, dbs, logger, now });
    } finally {
      await lockConn.raw("SELECT RELEASE_LOCK('snackhub.document_expiry')");
    }
  });
}

async function expiryPass({ env, dbs, logger, now }) {
  const summary = { reminded: 0, refreshed: 0, offline: 0 };
  const lastDay = new Date(now + EXPIRY_WARN_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const kind of Object.keys(KINDS)) {
    const k = KINDS[kind];
    const db = kindDb(dbs, kind);
    const docs = await k.documents.expiringBy(db, lastDay);
    const users = [...new Set(docs.map((d) => d.userId))];
    for (const userId of users) {
      const app = await k.applications.latestForUser(db, userId);
      if (!app || !['APPROVED', 'SUSPENDED'].includes(app.status)) continue;
      const all = await k.documents.listForUser(db, userId);
      const account = await userModel.findById(dbs.identity, userId);
      for (const d of docs.filter((x) => x.userId === userId)) {
        // only the version that counts: a renewal already approved makes the old one moot
        const counting = validApproved(all, d.docType, now) ?? all.filter((x) => x.docType === d.docType && x.status === 'APPROVED').sort((a, b) => b.version - a.version)[0];
        if (!counting || counting.id !== d.id) continue;
        const days = daysUntil(d.expiresOn, now);
        const due = reminderDue(days);
        if (due === null || (d.remindedDays !== null && d.remindedDays <= due)) continue;
        await db.transaction(async (trx) => {
          await queueEmail(env, trx, {
            template: due === 0 ? 'document_expired' : 'document_expiring',
            to: account.email,
            data: { name: account.name, role: kind, docLabel: DOC_TYPES[d.docType].label, days, date: d.expiresOn, link: `${env.APP_URL}/${kind}/onboarding` },
            dedupeKey: `${kind}-doc:${d.id}:expiry:${due}`,
          });
          await k.documents.markReminded(trx, d.id, due);
        });
        summary.reminded += 1;
      }
      await refreshValidity(dbs, kind, userId, db, now);
      summary.refreshed += 1;
    }
  }
  summary.offline = await riderModel.offlineWithExpiredDocs(dbs.dispatch);
  logger?.info(summary, 'document expiry pass');
  return summary;
}

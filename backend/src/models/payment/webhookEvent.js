// payment.webhook_events: every verified webhook, keyed by the provider's event id. record()
// returns false for an event already seen, so a re-delivered webhook is processed once.
const TABLE = 'webhook_events';

export const webhookEventModel = {
  record: (db, { eventId, type, payload }) =>
    db.raw(`INSERT IGNORE INTO ${TABLE} (event_id, type, payload, received_at) VALUES (?, ?, ?, ?)`, [eventId, type, JSON.stringify(payload), new Date()]).then(([r]) => r.affectedRows === 1),
  markProcessed: (db, eventId) => db(TABLE).where({ event_id: eventId }).update({ processed_at: new Date() }),
  listUnprocessed: (db, limit = 50) => db(TABLE).whereNull('processed_at').orderBy('received_at').limit(limit),
};

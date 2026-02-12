// payment.ledger_entries: append only. There is no update or delete here, and triggers in
// the database refuse both; a correction is a new row.
const TABLE = 'ledger_entries';

export const ledgerEntryModel = {
  append: (db, { paymentId, entryType, amountPaise }) => db(TABLE).insert({ payment_id: paymentId, entry_type: entryType, amount_paise: amountPaise, created_at: new Date() }).then(([id]) => id),
  listByPayment: (db, paymentId) => db(TABLE).where({ payment_id: paymentId }).orderBy('id'),
  /** Charges minus refunds, in paise. */
  balance: (db, paymentId) =>
    db(TABLE)
      .where({ payment_id: paymentId })
      .first(db.raw("COALESCE(SUM(CASE entry_type WHEN 'CHARGE' THEN amount_paise ELSE -amount_paise END), 0) AS balance"))
      .then((r) => Number(r.balance)),
};

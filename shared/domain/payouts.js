/**
 * Seller payouts (doc 8.5): what SnackHub owes a shop for a run of delivered orders.
 *
 *   gross       the food value of each delivered order (its subtotal, at the prices paid)
 *   commission  SnackHub's share, a percentage of each order rounded to the paisa, per order
 *   fines       applied fines on the shop, deducted
 *   returned    fines deducted earlier and reversed since, given back
 *   net         gross - commission - fines + returned
 *
 * The delivery fee and any app credit are SnackHub's, not the shop's: the shop is owed the
 * full food value however the customer paid (online, cash, or partly with credit). An order
 * becomes payable once its complaint window has passed (holdHours after delivery).
 */
export const MIN_PAYOUT_PAISE = 100;

/** Commission on one order, in paise: pct of the subtotal, rounded half up. */
export const commissionOn = (subtotalPaise, pct) => Math.round((subtotalPaise * pct) / 100);

/**
 * The statement for some orders and fines.
 *   orders:   [{ id, subtotalPaise }]
 *   fines:    [{ id, amountPaise }]          applied fines to deduct
 *   returned: [{ id, amountPaise }]          reversed fines that were deducted before
 */
export function statement({ orders = [], fines = [], returned = [] }, pct) {
  const lines = [
    ...orders.map((o) => ({ kind: 'ORDER', refId: o.id, grossPaise: o.subtotalPaise, commissionPaise: commissionOn(o.subtotalPaise, pct) })),
    ...fines.map((f) => ({ kind: 'FINE', refId: f.id, amountPaise: f.amountPaise })),
    ...returned.map((f) => ({ kind: 'FINE_RETURNED', refId: f.id, amountPaise: f.amountPaise })),
  ];
  const sum = (kind, key) => lines.filter((l) => l.kind === kind).reduce((s, l) => s + l[key], 0);
  const gross = sum('ORDER', 'grossPaise');
  const commission = sum('ORDER', 'commissionPaise');
  const fined = sum('FINE', 'amountPaise');
  const back = sum('FINE_RETURNED', 'amountPaise');
  return { lines, grossPaise: gross, commissionPaise: commission, finesPaise: fined, returnedPaise: back, netPaise: gross - commission - fined + back };
}

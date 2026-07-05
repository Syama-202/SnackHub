import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rupees } from '@shared/domain/money';
import { usePolling } from '../../hooks';
import { cancelPayout, draftPayout, fetchPayout, fetchPayouts, markPayoutPaid } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { Button, Card, Pill, cx } from '../../components/ui';
import { useAdmin } from '../App';

const when = (ms) => (ms ? new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const STATUS = { PENDING: ['Open', 'sun'], PAID: ['Paid', 'green'], CANCELLED: ['Cancelled', 'grey'] };

/**
 * Seller payouts (doc 8.5): what each shop is owed, statements drafted from it, marked paid
 * with the bank transfer reference, or cancelled. Drafting, paying and cancelling need a recent
 * second factor. The transfer itself is made from the bank; this records it.
 */
const Payouts = () => {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const data = useSelector((state) => state.admin.payouts);
  const [open, setOpen] = useState(null); // a statement with its lines
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  usePolling(() => dispatch(fetchPayouts()), 30000);

  const show = async (id) => {
    const p = await run(() => dispatch(fetchPayout(id)).unwrap());
    if (p) {
      setOpen(p);
      setReference('');
      setReason('');
    }
  };
  const draft = async (s) => {
    const p = await run(() => dispatch(draftPayout(s.sellerId)).unwrap());
    if (!p) return;
    dispatch(addToast({ type: 'success', title: `Statement #${p.id} drafted`, message: `${rupees(p.netPaise)} for ${s.shopName}. Make the transfer, then mark it paid.` }));
    dispatch(fetchPayouts());
    show(p.id);
  };
  const pay = async () => {
    const p = await run(() => dispatch(markPayoutPaid({ id: open.id, reference: reference.trim() })).unwrap());
    if (!p) return;
    dispatch(addToast({ type: 'success', title: 'Marked paid', message: `Statement #${p.id}, reference ${p.reference}. The shop was told.` }));
    setOpen(null);
    dispatch(fetchPayouts());
  };
  const cancel = async () => {
    const p = await run(() => dispatch(cancelPayout({ id: open.id, reason: reason.trim() })).unwrap());
    if (!p) return;
    dispatch(addToast({ type: 'success', title: 'Statement cancelled', message: 'Its orders are payable again.' }));
    setOpen(null);
    dispatch(fetchPayouts());
  };
  const refOk = /^[A-Za-z0-9/_.-]{6,60}$/.test(reference.trim());

  return (
    <div>
      <h1 className="page-title">Seller payouts</h1>
      <p className="mt-1 max-w-3xl text-grey-600">
        Shops are owed the food value of delivered orders {data ? `${data.holdHours} hours` : '…'} after delivery, less {data ? `${data.commissionPct}%` : '…'} commission and applied fines. Draft a statement, make the bank transfer, then record its reference here. Change the rate and the wait in the delivery policy.
      </p>

      <Card className="mt-6 overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Shops with money due">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-grey-600"><tr className="border-b border-grey-800/5"><th className="p-3">Shop</th><th className="p-3">Payable now</th><th className="p-3">Orders</th><th className="p-3">In the complaint window</th><th className="p-3">Bank</th><th className="p-3"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>
            {data && data.sellers.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-grey-600">No shop has delivered orders waiting to be paid.</td></tr>}
            {(data?.sellers ?? []).map((s) => (
              <tr key={s.sellerId} className="border-b border-grey-800/5 last:border-0">
                <td className="p-3 font-bold">{s.shopName}{s.demo && <Pill tone="sun" className="ml-1">Demo</Pill>}</td>
                <td className="p-3"><span className="font-extrabold">{rupees(Math.max(0, s.due.netPaise))}</span><span className="block text-xs text-grey-600">{rupees(s.due.grossPaise)} − {rupees(s.due.commissionPaise)}{s.due.finesPaise ? ` − ${rupees(s.due.finesPaise)} fines` : ''}{s.due.returnedPaise ? ` + ${rupees(s.due.returnedPaise)}` : ''}</span></td>
                <td className="p-3">{s.due.ordersCount}</td>
                <td className="p-3 text-grey-600">{s.due.waitingCount ? `${s.due.waitingCount} · ${rupees(s.due.waitingGrossPaise)}` : '–'}</td>
                <td className="p-3">{s.bank ? <span>{s.bank.holder}<span className="block font-mono text-xs text-grey-600">{s.bank.ifsc} · ••{s.bank.last4}</span></span> : <span className="font-semibold text-red-text">Missing</span>}</td>
                <td className="p-3 text-right">
                  {s.openPayoutId ? (
                    <Button size="sm" variant="ghost" onClick={() => show(s.openPayoutId)}>Open #{s.openPayoutId}</Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={s.due.netPaise < 100 || !s.bank || s.demo} onClick={() => draft(s)}>Draft statement</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {open && (
        <Card className="mt-4 p-5" role="region" aria-label={`Statement ${open.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold">Statement #{open.id} · {open.shopName}</h2>
              <p className="text-sm text-grey-600">{open.ordersCount} orders delivered {when(open.firstDeliveredAt)} to {when(open.lastDeliveredAt)} · commission {open.commissionPct}%</p>
            </div>
            <Pill tone={STATUS[open.status][1]}>{STATUS[open.status][0]}</Pill>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
            <div><dt className="text-grey-600">Food value</dt><dd className="font-bold">{rupees(open.grossPaise)}</dd></div>
            <div><dt className="text-grey-600">Commission</dt><dd className="font-bold">−{rupees(open.commissionPaise)}</dd></div>
            <div><dt className="text-grey-600">Fines</dt><dd className="font-bold">−{rupees(open.finesPaise)}</dd></div>
            <div><dt className="text-grey-600">Returned</dt><dd className="font-bold">+{rupees(open.returnedPaise)}</dd></div>
            <div><dt className="text-grey-600">To transfer</dt><dd className="text-lg font-extrabold">{rupees(open.netPaise)}</dd></div>
          </dl>
          <p className="mt-2 text-sm">To: {open.bank ? <><b>{open.bank.holder}</b>, IFSC <span className="font-mono">{open.bank.ifsc}</span>, account ending <b>{open.bank.last4}</b></> : <span className="font-semibold text-red-text">no bank account on file</span>}</p>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-bold">{open.lines.length} lines</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {open.lines.map((l) => (
                <li key={`${l.kind}${l.refId}`} className="flex justify-between rounded-lg bg-grey-50 px-3 py-1.5">
                  <span>{l.kind === 'ORDER' ? `Order #${l.refId}` : l.kind === 'FINE' ? `Fine #${l.refId}` : `Fine #${l.refId} returned`}</span>
                  <span className={cx('font-bold', l.kind === 'FINE' && 'text-red-text')}>{l.kind === 'ORDER' ? `${rupees(l.grossPaise)} − ${rupees(l.commissionPaise)}` : l.kind === 'FINE' ? `−${rupees(l.amountPaise)}` : `+${rupees(l.amountPaise)}`}</span>
                </li>
              ))}
            </ul>
          </details>
          {open.status === 'PENDING' && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Bank transfer reference (UTR)</span>
                  <input value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder="UTR or transaction id" aria-invalid={Boolean(reference) && !refOk} className="field h-11 font-mono" />
                </label>
                <Button className="mt-2" onClick={pay} disabled={!refOk}>Mark {rupees(open.netPaise)} paid</Button>
              </div>
              <div>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Or cancel, with a reason</span>
                  <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Bank details being checked" className="field h-11" />
                </label>
                <Button className="mt-2" variant="ghost" onClick={cancel} disabled={reason.trim().length < 5}>Cancel statement</Button>
              </div>
            </div>
          )}
          <Button className="mt-4" variant="ghost" size="sm" onClick={() => setOpen(null)}>Close</Button>
        </Card>
      )}

      <h2 className="mt-8 text-xl font-extrabold">Recent statements</h2>
      <Card className="mt-3 overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Recent statements">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-grey-600"><tr className="border-b border-grey-800/5"><th className="p-3">Statement</th><th className="p-3">Shop</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Reference</th></tr></thead>
          <tbody>
            {data && data.payouts.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-grey-600">No statements yet.</td></tr>}
            {(data?.payouts ?? []).map((p) => (
              <tr key={p.id} className="border-b border-grey-800/5 last:border-0">
                <td className="p-3"><button className="font-bold text-orange-text underline-offset-2 hover:underline" onClick={() => show(p.id)}>#{p.id}</button><span className="block text-xs text-grey-600">{when(p.createdAt)}</span></td>
                <td className="p-3">{p.shopName}</td>
                <td className="p-3 font-bold">{rupees(p.netPaise)}</td>
                <td className="p-3"><Pill tone={STATUS[p.status][1]}>{STATUS[p.status][0]}</Pill></td>
                <td className="p-3 font-mono text-xs">{p.reference ?? p.cancelReason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default Payouts;

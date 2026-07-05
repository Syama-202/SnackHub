import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { rupees } from '@shared/domain/money';
import { usePolling } from '../../hooks';
import { fetchCash, recordDeposit, reverseDeposit } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { Button, Card, Pill, cx } from '../../components/ui';
import { useAdmin } from '../App';

/**
 * Cash in hand (doc 8.5): what each rider holds from pay-on-delivery orders, and the deposits
 * staff record when they hand it in. A deposit can never be more than the rider holds, and a
 * mistake is reversed, never edited. Both need a recent second factor.
 */
const Cash = () => {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const cash = useSelector((state) => state.admin.cash);
  const [form, setForm] = useState(null); // { riderId, name, max, amount, note }
  const [reversing, setReversing] = useState(null); // { id, reason }
  usePolling(() => dispatch(fetchCash()), 20000, true, 'earning');

  const riders = cash?.riders ?? [];
  const nameOf = (id) => riders.find((r) => r.riderId === id)?.name ?? `Rider #${id}`;
  const amountPaise = form ? Math.round(Number(form.amount || 0) * 100) : 0;
  const valid = form && amountPaise >= 100 && amountPaise <= form.max;

  const save = async () => {
    const done = await run(() => dispatch(recordDeposit({ riderId: form.riderId, amountPaise, note: form.note.trim() || undefined })).unwrap());
    if (!done) return;
    dispatch(addToast({ type: 'success', title: 'Deposit recorded', message: `${form.name} now holds ${rupees(done.heldPaise)}.` }));
    setForm(null);
    dispatch(fetchCash());
  };
  const reverse = async () => {
    const done = await run(() => dispatch(reverseDeposit({ id: reversing.id, reason: reversing.reason.trim() })).unwrap());
    if (!done) return;
    dispatch(addToast({ type: 'success', title: 'Deposit reversed' }));
    setReversing(null);
    dispatch(fetchCash());
  };

  return (
    <div>
      <h1 className="page-title">Cash in hand</h1>
      <p className="mt-1 max-w-2xl text-grey-600">
        Pay-on-delivery cash each rider collected, less what they handed in. At {cash ? rupees(cash.limitPaise) : '…'} or more a rider gets no new pay-on-delivery orders until they deposit. Change the limit in the delivery policy.
      </p>

      <Card className="mt-6 overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Riders holding cash">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-grey-600">
            <tr className="border-b border-grey-800/5"><th className="p-3">Rider</th><th className="p-3">Collected</th><th className="p-3">Handed in</th><th className="p-3">Holds now</th><th className="p-3"><span className="sr-only">Action</span></th></tr>
          </thead>
          <tbody>
            {cash && riders.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-grey-600">No rider has collected cash yet.</td></tr>}
            {riders.map((r) => (
              <tr key={r.riderId} className="border-b border-grey-800/5 last:border-0">
                <td className="p-3"><span className="font-bold">{r.name}</span><span className="block text-xs capitalize text-grey-600">{r.cityId?.replace(/-/g, ' ')}</span></td>
                <td className="p-3">{rupees(r.collectedPaise)}</td>
                <td className="p-3">{rupees(r.depositedPaise)}</td>
                <td className="p-3"><span className={cx('font-extrabold', r.overLimit && 'text-red-text')}>{rupees(r.heldPaise)}</span> {r.overLimit && <Pill tone="red">Over limit</Pill>}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="ghost" disabled={r.heldPaise < 100} onClick={() => setForm({ riderId: r.riderId, name: r.name, max: r.heldPaise, amount: (r.heldPaise / 100).toFixed(2), note: '' })}>Record deposit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {form && (
        <Card className="mt-4 p-5" role="region" aria-label={`Deposit from ${form.name}`}>
          <h2 className="text-lg font-extrabold">Deposit from {form.name}</h2>
          <p className="text-sm text-grey-600">They hold {rupees(form.max)}. Count the cash before you record it.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr]">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Amount (₹)</span>
              <input type="number" inputMode="decimal" min="1" step="0.01" max={(form.max / 100).toFixed(2)} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-invalid={!valid} className="field h-11" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Note (optional)</span>
              <input value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Handed in at the hub" className="field h-11" />
            </label>
          </div>
          {!valid && <p role="alert" className="mt-2 text-sm font-semibold text-red-text">Enter an amount from ₹1 to {rupees(form.max)}.</p>}
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={!valid}>Record {valid ? rupees(amountPaise) : 'deposit'}</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      <h2 className="mt-8 text-xl font-extrabold">Recent deposits</h2>
      <Card className="mt-3 overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Recent deposits">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-grey-600"><tr className="border-b border-grey-800/5"><th className="p-3">When</th><th className="p-3">Rider</th><th className="p-3">Amount</th><th className="p-3">Note</th><th className="p-3"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>
            {cash && cash.recent.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-grey-600">No deposits recorded yet.</td></tr>}
            {(cash?.recent ?? []).map((d) => {
              const reversed = d.kind === 'DEPOSIT' && cash.recent.some((x) => x.reversesId === d.id);
              return (
                <tr key={d.id} className="border-b border-grey-800/5 last:border-0">
                  <td className="p-3 text-grey-600">{new Date(d.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="p-3 font-bold">{nameOf(d.riderId)}</td>
                  <td className="p-3">{d.kind === 'REVERSAL' ? <span className="text-red-text">−{rupees(d.amountPaise)} reversal</span> : rupees(d.amountPaise)} {reversed && <Pill tone="grey">Reversed</Pill>}</td>
                  <td className="p-3 text-grey-600">{d.note ?? ''}</td>
                  <td className="p-3 text-right">{d.kind === 'DEPOSIT' && !reversed && <button onClick={() => setReversing({ id: d.id, reason: '' })} className="text-sm font-bold text-red-text">Reverse</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {reversing && (
        <Card className="mt-4 p-5" role="region" aria-label="Reverse a deposit">
          <h2 className="text-lg font-extrabold">Reverse this deposit?</h2>
          <p className="text-sm text-grey-600">The deposit stays on record; a reversal row cancels it and the rider holds that cash again.</p>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-bold">Reason</span>
            <input value={reversing.reason} maxLength={200} onChange={(e) => setReversing({ ...reversing, reason: e.target.value })} placeholder="Recorded against the wrong rider" className="field h-11" />
          </label>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" onClick={reverse} disabled={reversing.reason.trim().length < 5}>Reverse deposit</Button>
            <Button variant="ghost" onClick={() => setReversing(null)}>Keep it</Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Cash;

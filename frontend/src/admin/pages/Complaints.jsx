import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { usePolling } from '../../hooks';
import { decideComplaint, fetchComplaints, fetchEarningsAdmin, fetchFines, resolveEarning, reverseFine } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { rupees } from '@shared/domain/money';
import { COMPLAINT_TYPES } from '@shared/domain/triage';
import { Button, Card, Pill, cx } from '../../components/ui';
import { useAdmin } from '../App';

/** Complaint review with the system's evidence (doc 10.7). Fine decisions need fresh MFA. */
export default function Complaints() {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const { complaints: data, fines, earnings } = useSelector((state) => state.admin);
  usePolling(() => dispatch(fetchComplaints()), 4000);
  usePolling(() => dispatch(fetchFines()), 8000);
  usePolling(() => dispatch(fetchEarningsAdmin()), 8000);
  const [sel, setSel] = useState(null);
  const c = data?.find((x) => x.id === sel) || data?.find((x) => x.status === 'IN_REVIEW') || data?.[0];
  const [form, setForm] = useState({ resolution: 'VALID', creditPaise: 5000, riderFinePaise: 0, sellerFinePaise: 0, reason: '' });

  const decide = async () => {
    const done = await run(() => dispatch(decideComplaint({ id: c.id, ...form })).unwrap());
    if (!done) return;
    dispatch(fetchFines());
    dispatch(addToast({ title: 'Complaint resolved', type: 'success' }));
  };
  // every reversal and dispute decision carries a written reason, kept in the audit log
  const reverse = async (f) => {
    const reason = window.prompt(`Why reverse fine #${f.id}?`);
    if (!reason?.trim()) return;
    await run(() => dispatch(reverseFine({ id: f.id, reason: reason.trim() })).unwrap());
  };
  const settle = async (e, giveBack) => {
    const reason = window.prompt(giveBack ? `Why give back the cut on order #${e.orderId}?` : `Why keep the cut on order #${e.orderId}?`);
    if (!reason?.trim()) return;
    const done = await run(() => dispatch(resolveEarning({ id: e.id, reverse: giveBack, reason: reason.trim() })).unwrap());
    if (done) dispatch(addToast({ title: giveBack ? 'Cut given back' : 'Cut kept', type: 'success' }));
  };
  const disputes = (earnings ?? []).filter((e) => e.status === 'DISPUTED');

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Complaints</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {data?.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={cx('w-full rounded-2xl p-3 text-left text-sm transition', c?.id === x.id ? 'bg-grey-800 text-white' : 'bg-white hover:bg-grey-50')}>
              <span className="flex justify-between font-bold"><span>#{x.id} · order #{x.orderId}</span><span>{x.status.replace('_', ' ').toLowerCase()}</span></span>
              <span className="block opacity-80">{COMPLAINT_TYPES[x.category]?.subtypes[x.subtype] || x.subtype} · {x.classification?.toLowerCase()}</span>
            </button>
          ))}
          {data?.length === 0 && <p className="text-grey-600">No complaints.</p>}
        </div>
        {c && (
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold">Complaint #{c.id}</h2>
              <Pill tone="orange">{COMPLAINT_TYPES[c.category]?.label}</Pill>
              <Pill>{COMPLAINT_TYPES[c.category]?.subtypes[c.subtype] || c.subtype}</Pill>
              {c.autoDecided && <Pill tone="green">Auto-resolved</Pill>}
            </div>
            {c.description && <p className="mt-2 text-grey-600">“{c.description}”</p>}
            {c.safety && <p className="mt-2 rounded-xl bg-red-strong p-2 text-sm font-bold text-white">Unsafe food reported: the shop was paused at once.</p>}
            {c.photos?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.photos.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer noopener" className="block">
                    <img src={p.url} alt={`Photo ${p.id} attached to complaint ${c.id}`} className="h-24 w-24 rounded-xl object-cover ring-1 ring-grey-800/10" />
                  </a>
                ))}
              </div>
            )}
            <h3 className="mt-4 font-bold">Triage</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Fact k="Fault" v={c.classification} />
              <Fact k="Confidence" v={c.confidence != null ? `${Math.round(c.confidence * 100)}%` : '–'} />
              <Fact k="Rider share" v={`${c.riderSharePct ?? 0}%`} />
              <Fact k="Shop share" v={`${c.sellerSharePct ?? 0}%`} />
            </div>
            <h3 className="mt-4 font-bold">Evidence the system attached</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Fact k="Promised" v={new Date(c.evidence.promisedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} />
              <Fact k="Delivered" v={new Date(c.evidence.deliveredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} />
              <Fact k="Shop delay" v={`${Math.round(c.evidence.sellerDelayMin ?? 0)} min`} />
              <Fact k="Rider late" v={`${Math.round(c.evidence.riderLateMin ?? 0)} min`} />
              <Fact k="OTP / geofence" v={`${c.evidence.otpVerified ? 'verified' : 'missing'} / ${c.evidence.geofencePassed ? 'passed' : 'failed'}`} />
              <Fact k="Pickup seal" v={c.evidence.pickupSealed ? 'sealed, counted' : 'not confirmed'} />
            </div>
            <p className="mt-2 text-xs text-grey-600">The shop and rider see the same evidence, with the customer’s details removed.</p>

            {c.status === 'IN_REVIEW' ? (
              <div className="mt-5 grid gap-3 rounded-2xl bg-grey-50 p-4 sm:grid-cols-2">
                <label className="text-sm font-bold">Decision
                  <select value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-grey-800/15 bg-white px-3">
                    <option value="VALID">Valid</option><option value="PARTLY_VALID">Partly valid</option><option value="INVALID">Invalid</option>
                  </select>
                </label>
                <MoneyField label="Customer credit" v={form.creditPaise} on={(v) => setForm({ ...form, creditPaise: v })} />
                <MoneyField label="Rider fine" v={form.riderFinePaise} on={(v) => setForm({ ...form, riderFinePaise: v })} />
                <MoneyField label="Shop fine" v={form.sellerFinePaise} on={(v) => setForm({ ...form, sellerFinePaise: v })} />
                <label className="text-sm font-bold sm:col-span-2">Reason (shown to the parties)
                  <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-grey-800/15 bg-white px-3" placeholder="Explain the decision in plain words" />
                </label>
                <p className="text-xs text-grey-600 sm:col-span-2">A late complaint never adds a second rider fine if the lateness cut was already applied; only the credit is added.</p>
                <Button className="sm:col-span-2" disabled={!form.reason} onClick={decide}>Resolve complaint</Button>
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">Resolved: {c.resolution?.toLowerCase()} {c.reason ? `· ${c.reason}` : ''} {c.lateAlreadyCut ? '· rider fine skipped (lateness cut already applied)' : ''}</p>
            )}
          </Card>
        )}
      </div>

      <h2 className="mt-10 text-xl font-extrabold">Rider pay disputes</h2>
      <div className="mt-3 space-y-2">
        {disputes.length === 0 && <p className="text-sm text-grey-600">No open disputes.</p>}
        {disputes.map((e) => (
          <Card key={e.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="flex-1"><b>Order #{e.orderId}</b> · rider #{e.riderId} · cut {rupees(e.penaltyPaise)} · “{e.disputeReason}”</span>
            <Button size="sm" onClick={() => settle(e, true)}>Give the cut back</Button>
            <Button size="sm" variant="ghost" onClick={() => settle(e, false)}>Keep it</Button>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-extrabold">Fines ledger</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-grey-600"><tr><th className="p-3">Fine</th><th className="p-3">Target</th><th className="p-3">Reason</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
          <tbody>
            {fines?.length === 0 && <tr><td colSpan="6" className="p-3 text-grey-600">No fines yet.</td></tr>}
            {fines?.map((f) => (
              <tr key={f.id} className="border-t border-grey-800/5">
                <td className="p-3 font-bold">#{f.id}</td><td className="p-3">{f.targetType.toLowerCase()} #{f.targetId}</td><td className="p-3">{f.reason}</td><td className="p-3">{rupees(f.amountPaise)}</td>
                <td className="p-3"><Pill tone={f.status === 'REVERSED' ? 'grey' : 'red'}>{f.status.toLowerCase()}</Pill></td>
                <td className="p-3">{f.status === 'APPLIED' && <Button size="sm" variant="ghost" onClick={() => reverse(f)}>Reverse</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Fact({ k, v }) {
  return <div className="rounded-xl bg-grey-50 p-2"><p className="text-xs text-grey-600">{k}</p><p className="font-bold">{v}</p></div>;
}

function MoneyField({ label, v, on }) {
  return (
    <label className="text-sm font-bold">{label} (₹)
      <input type="number" min="0" step="1" value={v / 100} onChange={(e) => on(Math.round(Number(e.target.value || 0) * 100))} className="mt-1 h-11 w-full rounded-xl border border-grey-800/15 bg-white px-3" />
    </label>
  );
}

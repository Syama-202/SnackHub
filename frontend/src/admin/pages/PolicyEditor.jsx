import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchPolicy, savePolicy } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { computeEarning } from '@shared/domain/penalty';
import { deliveryPromise } from '@shared/domain/promise';
import { rupeesExact } from '@shared/domain/money';
import { Button, Card, Pill } from '../../components/ui';
import { useAdmin } from '../App';

const FIELDS = [
  ['speedKmph', 'Average rider speed', 'km/h'],
  ['roadFactor', 'Road factor', '×'],
  ['otpRevealM', 'Code unlocks within', 'm'],
  ['arrivalGeofenceM', 'Arrival geofence', 'm'],
  ['offerTimeoutSec', 'Offer timeout', 's'],
  ['graceMin', 'Lateness grace', 'min'],
  ['lateRatePaisePerMin', 'Lateness rate', 'paise/min'],
  ['penaltyCapPaise', 'Penalty cap', 'paise'],
  ['baseFeePaise', 'Base fee', 'paise'],
  ['distanceFeePaisePerKm', 'Distance fee', 'paise/km'],
  ['onTimeBonusPaise', 'On-time bonus', 'paise'],
];

/** Delivery policy editor (doc 11.4): versioned, applies only to later orders. */
export default function PolicyEditor() {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const data = useSelector((state) => state.admin.policy);
  useEffect(() => {
    dispatch(fetchPolicy());
  }, [dispatch]);
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (data && !draft) setDraft(data.current);
  }, [data, draft]);
  if (!draft) return <div className="skeleton h-64" />;

  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const setRule = (cls, k, v) => setDraft({ ...draft, [cls]: { ...draft[cls], [k]: v } });
  const save = async () => {
    const changes = Object.fromEntries(Object.entries(draft).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(data.current[k]) && k !== 'version'));
    if (!Object.keys(changes).length) return dispatch(addToast({ title: 'Nothing changed' }));
    const saved = await run(() => dispatch(savePolicy(changes)).unwrap());
    if (!saved) return;
    await dispatch(fetchPolicy());
    setDraft(null);
    dispatch(addToast({ title: 'Policy saved', message: 'It applies to orders placed from now on.', type: 'success' }));
  };

  // Live preview: the three worked cases from doc 27.2 and a 2.5 km promise
  const cases = [['A: rider only', 14, 0], ['B: seller only', 14, 12], ['C: shared', 14, 5]].map(([l, late, seller]) => [l, computeEarning({ km: 1.9, lateMin: late, sellerDelayMin: seller }, draft)]);
  const hot = deliveryPromise({ straightKm: 2.5, temp: 'HOT' }, draft);
  const amb = deliveryPromise({ straightKm: 4.2, temp: 'AMBIENT' }, draft);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold">Delivery policy</h1>
        <Pill tone="dark">Current v{data.current.version}</Pill>
      </div>
      <p className="mt-1 text-sm text-grey-600">Starting values to tune from real data. Each order stores the policy version it was priced under, so a change never rewrites open orders.</p>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {[['hot', 'Hot snacks'], ['ambient', 'Sweets and dry']].map(([cls, label]) => (
              <fieldset key={cls} className="rounded-2xl bg-grey-50 p-3">
                <legend className="px-1 font-bold">{label}</legend>
                <Num label="Max distance" unit="km" v={draft[cls].maxKm} on={(v) => setRule(cls, 'maxKm', v)} />
                <Num label="Max ride" unit="min" v={draft[cls].maxRideMin} on={(v) => setRule(cls, 'maxRideMin', v)} />
                <Num label="Orders per rider" unit="" v={draft[cls].riderCap} on={(v) => setRule(cls, 'riderCap', v)} />
              </fieldset>
            ))}
            {FIELDS.map(([k, l, u]) => <Num key={k} label={l} unit={u} v={draft[k]} on={(v) => set(k, v)} step={k === 'roadFactor' ? 0.1 : 1} />)}
            <label className="flex items-center gap-3 rounded-2xl bg-grey-50 p-3 font-bold">
              <input type="checkbox" checked={draft.codEnabled} onChange={(e) => set('codEnabled', e.target.checked)} className="h-5 w-5 accent-orange-deep" /> Pay on delivery enabled
            </label>
          </div>
          <div className="mt-5 flex gap-2">
            <Button onClick={save}>Save as v{data.current.version + 1}</Button>
            <Button variant="ghost" onClick={() => setDraft(data.current)}>Discard</Button>
          </div>
          <p className="mt-2 text-xs text-grey-600">Saving needs a second-factor check from the last 5 minutes and is written to the audit log.</p>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-extrabold">Preview: worked penalty cases</h2>
            <p className="text-xs text-grey-600">Delivered 14 min after the promise. The policy screen, order timeline and earnings ledger must show the same figure.</p>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-grey-600"><tr><th className="py-1">Case</th><th>Rider late</th><th>Cut</th><th className="text-right">Net</th></tr></thead>
              <tbody>
                {cases.map(([l, e]) => (
                  <tr key={l} className="border-t border-grey-800/5"><td className="py-1.5 font-bold">{l}</td><td>{e.inputs.riderLateMin} min</td><td className="text-red-text">−{rupeesExact(e.penaltyPaise)}</td><td className="text-right font-bold">{rupeesExact(e.netPaise)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="p-5">
            <h2 className="font-extrabold">Preview: delivery promise</h2>
            <p className="mt-2 text-sm">Hot, 2.5 km: {hot.serviceable ? <b>{hot.window[0]} to {hot.window[1]} min</b> : <span className="font-bold text-red-text">{hot.reasons[0]}</span>} <span className="text-grey-600">(ride {hot.rideMin.toFixed(1)} min)</span></p>
            <p className="mt-1 text-sm">Sweet, 4.2 km: {amb.serviceable ? <b>{amb.window[0]} to {amb.window[1]} min</b> : <span className="font-bold text-red-text">{amb.reasons[0]}</span>} <span className="text-grey-600">(ride {amb.rideMin.toFixed(1)} min)</span></p>
          </Card>
          <Card className="p-5">
            <h2 className="font-extrabold">History</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {data.history.map((h) => <li key={h.version + h.effectiveFrom} className="flex justify-between"><span className="font-bold">v{h.version}</span><span className="text-grey-600">{new Date(h.effectiveFrom).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {h.changedBy}</span></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Num({ label, unit, v, on, step = 1 }) {
  return (
    <label className="mt-2 block text-sm font-bold">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input type="number" step={step} min="0" value={v} onChange={(e) => on(Number(e.target.value))} className="h-11 w-full rounded-xl border border-grey-800/15 bg-white px-3" />
        <span className="w-20 shrink-0 text-xs font-semibold text-grey-600">{unit}</span>
      </span>
    </label>
  );
}

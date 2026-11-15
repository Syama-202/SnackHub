import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateProduct } from '../../store/slices/seller';
import { addToast } from '../../store/slices/toast';
import { DAYS, DAY_LABEL } from '@shared/domain/hours';
import { SLOT_LABEL, servingSlot } from '@shared/domain/availability';
import { Button, Modal, CloseButton, cx } from '../ui';

// presets a seller picks from; any times can be set by hand (a window may run past midnight)
const PRESETS = [
  { id: 'all', label: 'All shop hours', windows: null },
  { id: 'breakfast', label: 'Breakfast', windows: [['06:30', '11:30']] },
  { id: 'evening', label: 'Evening', windows: [['16:30', '21:30']] },
  { id: 'late', label: 'Late night', windows: [['20:00', '01:30']] },
];
const week = (windows, days = DAYS) => Object.fromEntries(DAYS.map((d) => [d, days.includes(d) ? windows : []]));
const HOUR = 3600_000;

/** When a snack is served, and switching it off for a while (doc 12.1). */
export default function ServingTimes({ product: p, onClose }) {
  const dispatch = useDispatch();
  const first = p.availableHours ? Object.values(p.availableHours).find((w) => w?.length) : null;
  const [windows, setWindows] = useState(first ?? [['16:30', '21:30']]);
  const [days, setDays] = useState(p.availableHours ? DAYS.filter((d) => p.availableHours[d]?.length) : DAYS);
  const [all, setAll] = useState(!p.availableHours);
  const [saving, setSaving] = useState(false);

  const save = async (changes, done) => {
    setSaving(true);
    try {
      await dispatch(updateProduct({ id: p.id, ...changes })).unwrap();
      dispatch(addToast({ type: 'success', title: done }));
      onClose();
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Not saved', message: e.message }));
    } finally {
      setSaving(false);
    }
  };
  const pick = (preset) => {
    setAll(!preset.windows);
    if (preset.windows) setWindows(preset.windows);
  };
  const setTime = (i, j, v) => setWindows((ws) => ws.map((w, k) => (k === i ? (j === 0 ? [v, w[1]] : [w[0], v]) : w)));
  const off = (ms, label) => save({ unavailable: true, ...(ms ? { unavailableUntil: Date.now() + ms } : { unavailableUntil: null }) }, `${p.title} is off ${label}`);
  const endOfToday = () => {
    const ist = new Date(Date.now() + 330 * 60_000);
    return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1) - 330 * 60_000 - Date.now();
  };

  return (
    <Modal open onClose={onClose} title={`Serving times for ${p.title}`}>
      <div className="relative p-6">
        <CloseButton onClick={onClose} className="absolute right-3 top-3" />
        <h2 className="pr-10 text-2xl font-bold">When is {p.title} served?</h2>
        <p className="mt-1 text-sm text-grey-600">Outside these times customers still find it, with when it is back, but cannot order it. Times are India time; a window can run past midnight (8:00 pm to 1:30 am).</p>

        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Presets">
          {PRESETS.map((pr) => {
            const on = pr.windows ? !all && JSON.stringify(windows) === JSON.stringify(pr.windows) : all;
            return (
              <button key={pr.id} type="button" role="radio" aria-checked={on} onClick={() => pick(pr)} className={cx('h-9 rounded-full border px-3.5 text-sm font-semibold', on ? 'border-orange bg-sun/20' : 'border-grey-800/15 bg-white')}>
                {pr.label}
              </button>
            );
          })}
        </div>

        {!all && (
          <div className="mt-4 space-y-3">
            {windows.map((w, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1">From <input type="time" value={w[0]} onChange={(e) => setTime(i, 0, e.target.value)} className="field h-10 w-32" /></label>
                <label className="flex items-center gap-1">to <input type="time" value={w[1] === '24:00' ? '00:00' : w[1]} onChange={(e) => setTime(i, 1, e.target.value)} className="field h-10 w-32" /></label>
                {windows.length > 1 && <button type="button" onClick={() => setWindows((ws) => ws.filter((_, k) => k !== i))} className="text-xs font-semibold text-red-text">Remove</button>}
              </div>
            ))}
            {windows.length < 3 && <button type="button" onClick={() => setWindows((ws) => [...ws, ['18:00', '22:00']])} className="text-sm font-semibold text-orange-text">+ Another window</button>}
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="sr-only">Days</legend>
              {DAYS.map((d) => (
                <label key={d} className={cx('cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold', days.includes(d) ? 'border-orange bg-sun/20' : 'border-grey-800/15')}>
                  <input type="checkbox" className="sr-only" checked={days.includes(d)} onChange={(e) => setDays((ds) => (e.target.checked ? [...ds, d] : ds.filter((x) => x !== d)))} />
                  {DAY_LABEL[d].slice(0, 3)}
                </label>
              ))}
            </fieldset>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={saving}
            disabled={!all && !days.length}
            onClick={() => {
              const hours = all ? null : week(windows, days);
              save({ availableHours: hours }, all ? `${p.title} is served all shop hours` : `${p.title}: ${SLOT_LABEL[servingSlot(hours)]} times saved`);
            }}
          >
            Save times
          </Button>
        </div>

        <div className="mt-6 border-t border-grey-800/10 pt-4">
          <p className="font-semibold">{p.unavailable ? `${p.title} is switched off${p.unavailableUntil ? ` until ${new Date(p.unavailableUntil).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''}` : 'Ran out of an ingredient?'}</p>
          <p className="text-sm text-grey-600">{p.unavailable ? 'Customers see it as on a short break.' : 'Switch it off for a while; customers see when it is back.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.unavailable ? (
              <Button size="sm" loading={saving} onClick={() => save({ unavailable: false }, `${p.title} is back on`)}>Switch it back on</Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => off(HOUR, 'for an hour')}>For an hour</Button>
                <Button size="sm" variant="ghost" onClick={() => off(endOfToday(), 'for the rest of today')}>Rest of today</Button>
                <Button size="sm" variant="ghost" onClick={() => off(endOfToday() + 9 * HOUR, 'until tomorrow morning')}>Until tomorrow</Button>
                <Button size="sm" variant="ghost" onClick={() => off(null, 'until you switch it back')}>Until I switch it back</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchShopProfile, updateShop } from '../../store/slices/seller';
import { Button, Card, Icon, Pill, Skeleton, cx } from '../../components/ui';
import { addToast } from '../../store/slices/toast';
import { DAYS, DAY_LABEL, MAX_CLOSED_DATES, MAX_PINCODES, PINCODE, istDate, scheduleOf, scheduleProblem } from '@shared/domain/hours';

const SHOP_STEPS = ['draft', 'pending', 'probation', 'active'];

/** Verification status, busy mode, pause, opening hours, holidays and pincodes (doc 16.4, 11.2). */
const SellerShop = () => {
  const dispatch = useDispatch();
  const s = useSelector((state) => state.seller.shop);

  useEffect(() => {
    dispatch(fetchShopProfile());
  }, [dispatch]);

  if (!s) return <Skeleton className="h-64" />;
  const save = async (changes, done) => {
    try {
      await dispatch(updateShop(changes)).unwrap();
      if (done) dispatch(addToast({ type: 'success', title: done }));
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Not saved', message: e.details?.issues?.[0]?.message ?? e.message }));
    }
  };
  const expDays = s.licenceExpiresOn ? Math.round((new Date(s.licenceExpiresOn) - Date.now()) / 86400000) : null;
  const soon = expDays != null && expDays < 30;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="page-title">{s.shopName}</h1>
        <p className="text-grey-600">{[s.city, s.region].filter(Boolean).join(', ')}</p>
        <Card className="mt-4 p-5">
          <h2 className="text-lg font-bold">Verification status</h2>
          <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {SHOP_STEPS.map((st, i) => {
              const reached = SHOP_STEPS.indexOf(s.status) >= i;
              return (
                <li key={st} className="flex items-center gap-2">
                  <span className={cx('rounded-full px-3 py-1 font-semibold capitalize', s.status === st ? 'bg-grey-800 text-white' : reached ? 'bg-emerald-50 text-emerald-700' : 'bg-grey-50 text-grey-600')}>{st === 'pending' ? 'under review' : st}</span>
                  {i < SHOP_STEPS.length - 1 && <Icon name="arrowRight" className="h-4 w-4 text-grey-400" />}
                </li>
              );
            })}
          </ol>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-grey-600">Food licence</dt><dd className="font-mono font-semibold">{s.licenceNo ?? '–'}</dd></div>
            <div><dt className="text-grey-600">Expires</dt><dd className={cx('font-semibold', soon && 'text-red-text')}>{s.licenceExpiresOn ? `${s.licenceExpiresOn} (${expDays} days)` : '–'}</dd></div>
            <div><dt className="text-grey-600">Quality score</dt><dd className="font-semibold">{s.qualityScore == null ? 'No ratings yet' : `${s.qualityScore} / 100`}</dd></div>
            <div><dt className="text-grey-600">Acceptance rate</dt><dd className="font-semibold">{s.acceptanceRate == null ? '–' : `${Math.round(s.acceptanceRate * 100)}%`}</dd></div>
          </dl>
          {soon && <p className="mt-3 rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text">Your licence expires soon. The shop is suspended on the expiry date until a renewed licence is verified.</p>}
          <p className="mt-3 text-xs text-grey-600">The “Verified shop” badge shows only while your licence is valid and the shop is active. Below 70 warns, below 60 limits your reach, below 50 suspends.</p>
        </Card>
      </div>
      <Card className="p-5 lg:mt-16">
        <h2 className="text-lg font-bold">Busy mode</h2>
        <p className="text-sm text-grey-600">Add prep time when the kitchen is slammed, so the delivery time customers see stays honest. Shops that cannot make 30 minutes for an address are not shown there.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Extra prep minutes">
          {[0, 3, 6, 10].map((m) => (
            <button key={m} role="radio" aria-checked={s.busyExtraMin === m} onClick={() => save({ busyExtraMin: m })} className={cx('h-11 rounded-full px-4 font-semibold', s.busyExtraMin === m ? 'bg-grey-800 text-white' : 'bg-grey-50')}>
              {m === 0 ? 'Normal' : `+${m} min`}
            </button>
          ))}
        </div>
        <h2 className="mt-6 text-lg font-bold">Pause the shop</h2>
        <p className="text-sm text-grey-600">Paused shops are hidden from customers. Open orders still need to be finished.</p>
        <Button className="mt-3" variant={s.paused ? 'primary' : 'outline'} onClick={() => save({ paused: !s.paused })}>{s.paused ? 'Resume taking orders' : 'Pause new orders'}</Button>
        <p className="mt-6 text-sm text-grey-600">Delivery radius: <b>{s.radiusKm} km</b> (hot snacks are capped at 3 km)</p>
      </Card>
      <HoursCard shop={s} save={save} />
      <div className="grid content-start gap-6">
        <HolidaysCard shop={s} save={save} />
        <PincodesCard shop={s} save={save} />
      </div>
    </div>
  );
};

const START = [['09:00', '21:00']];

/** The week: open or closed each day, with one or two windows, in India time. */
function HoursCard({ shop, save }) {
  const initial = () => {
    const w = shop.weeklyHours ?? scheduleOf({ openHours: shop.openHours });
    return Object.fromEntries(DAYS.map((d) => [d, (w?.[d] ?? (w ? [] : START)).map((x) => [...x])]));
  };
  const [week, setWeek] = useState(initial);
  const [saving, setSaving] = useState(false);
  const problem = scheduleProblem(week);
  const setDay = (d, windows) => setWeek((w) => ({ ...w, [d]: windows }));
  const setTime = (d, i, j, v) => setDay(d, week[d].map((x, k) => (k === i ? (j === 0 ? [v, x[1]] : [x[0], v]) : x)));
  const submit = async () => {
    setSaving(true);
    await save({ weeklyHours: week }, 'Opening hours saved');
    setSaving(false);
  };
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Opening hours</h2>
        {shop.hours && <Pill tone={shop.hours.openNow ? 'green' : 'grey'}>{shop.hours.openNow ? shop.hours.label : `Closed now · ${shop.hours.label}`}</Pill>}
      </div>
      <p className="text-sm text-grey-600">India time. Customers see your snacks only while you are open; outside these hours your shop shows when it opens next.</p>
      <ul className="mt-4 divide-y divide-grey-800/5">
        {DAYS.map((d) => {
          const open = week[d].length > 0;
          return (
            <li key={d} className="flex flex-wrap items-center gap-3 py-2.5">
              <label className="flex w-32 items-center gap-2 font-semibold">
                <input type="checkbox" checked={open} onChange={(e) => setDay(d, e.target.checked ? START.map((x) => [...x]) : [])} className="h-5 w-5 accent-orange-deep" />
                {DAY_LABEL[d]}
              </label>
              {!open && <span className="text-sm text-grey-600">Closed</span>}
              {week[d].map(([a, b], i) => (
                <span key={i} className="flex items-center gap-1 text-sm">
                  <input type="time" value={a} onChange={(e) => setTime(d, i, 0, e.target.value)} aria-label={`${DAY_LABEL[d]} window ${i + 1} opens`} className="field h-11 w-auto" />
                  <span aria-hidden="true">to</span>
                  <input type="time" value={b === '24:00' ? '23:59' : b} onChange={(e) => setTime(d, i, 1, e.target.value === '23:59' ? '24:00' : e.target.value)} aria-label={`${DAY_LABEL[d]} window ${i + 1} closes`} className="field h-11 w-auto" />
                  {i === 1 && <button type="button" onClick={() => setDay(d, week[d].slice(0, 1))} className="grid h-8 w-8 place-items-center rounded-full hover:bg-grey-800/5" aria-label={`Remove the second window on ${DAY_LABEL[d]}`}><Icon name="x" className="h-4 w-4" /></button>}
                </span>
              ))}
              {open && week[d].length === 1 && (
                <button type="button" onClick={() => setDay(d, [...week[d], ['17:00', '21:00']])} className="-mx-2 inline-flex min-h-9 items-center rounded-full px-2 text-sm font-semibold text-orange-text hover:bg-orange/10">+ second window</button>
              )}
            </li>
          );
        })}
      </ul>
      {problem && <p role="alert" className="mt-2 text-sm font-semibold text-red-text">{problem}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={submit} loading={saving} disabled={Boolean(problem)}>Save hours</Button>
        <Button variant="ghost" onClick={() => setWeek(Object.fromEntries(DAYS.map((d) => [d, week.mon.map((x) => [...x])])))}>Use Monday for every day</Button>
      </div>
    </Card>
  );
}

/** Days off on top of the week: festivals, holidays, a family function. */
function HolidaysCard({ shop, save }) {
  const [day, setDay] = useState('');
  const today = istDate(Date.now()).date;
  const dates = shop.closedDates ?? [];
  const add = () => {
    if (!day || dates.includes(day)) return;
    save({ closedDates: [...dates, day] }, 'Holiday added');
    setDay('');
  };
  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Holidays</h2>
      <p className="text-sm text-grey-600">The shop stays closed all day on these dates, whatever the weekly hours say.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="holiday">Date</label>
        <input id="holiday" type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} className="field h-11 w-auto" />
        <Button variant="ghost" onClick={add} disabled={!day || dates.length >= MAX_CLOSED_DATES}>Add holiday</Button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {dates.length === 0 && <li className="text-sm text-grey-600">No holidays set.</li>}
        {dates.map((d) => (
          <li key={d} className="inline-flex items-center gap-1 rounded-full bg-grey-50 py-1 pl-3 pr-1 text-sm font-semibold">
            {new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
            <button onClick={() => save({ closedDates: dates.filter((x) => x !== d) }, 'Holiday removed')} className="grid h-7 w-7 place-items-center rounded-full hover:bg-grey-800/10" aria-label={`Remove holiday ${d}`}><Icon name="x" className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Pincodes on top of the radius: with a list, only addresses with those pincodes can order. */
function PincodesCard({ shop, save }) {
  const [text, setText] = useState('');
  const pins = shop.pincodes ?? [];
  const typed = text.split(/[\s,]+/).filter(Boolean);
  const bad = typed.filter((x) => !PINCODE.test(x));
  const add = () => {
    if (!typed.length || bad.length) return;
    save({ pincodes: [...new Set([...pins, ...typed])] }, 'Pincodes saved');
    setText('');
  };
  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Delivery pincodes</h2>
      <p className="text-sm text-grey-600">
        {pins.length ? 'You deliver only to these pincodes, and only within your radius.' : 'Empty: you deliver to every address within your radius. Add pincodes to deliver only to those areas.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="pins">Pincodes</label>
        <input id="pins" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} inputMode="numeric" placeholder="522001, 522002" aria-invalid={bad.length > 0} className="field h-11 min-w-0 flex-1" />
        <Button variant="ghost" onClick={add} disabled={!typed.length || bad.length > 0 || pins.length + typed.length > MAX_PINCODES}>Add</Button>
      </div>
      {bad.length > 0 && <p role="alert" className="mt-1 text-sm font-semibold text-red-text">{bad[0]} is not a pincode: six digits, not starting with 0.</p>}
      <ul className="mt-3 flex flex-wrap gap-2">
        {pins.map((x) => (
          <li key={x} className="inline-flex items-center gap-1 rounded-full bg-grey-50 py-1 pl-3 pr-1 font-mono text-sm font-semibold">
            {x}
            <button onClick={() => save({ pincodes: pins.filter((y) => y !== x) }, 'Pincode removed')} className="grid h-7 w-7 place-items-center rounded-full hover:bg-grey-800/10" aria-label={`Remove pincode ${x}`}><Icon name="x" className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      {pins.length > 0 && <button onClick={() => save({ pincodes: [] }, 'Delivering by distance only')} className="mt-3 text-sm font-semibold text-orange-text">Remove all and deliver by distance</button>}
    </Card>
  );
}

export default SellerShop;

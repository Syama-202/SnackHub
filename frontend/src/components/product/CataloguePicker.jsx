import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { rupees } from '@shared/domain/money';
import { CATEGORY_LABELS, MIN_PRICE_PAISE, MAX_PRICE_PAISE } from '@shared/domain/menu';
import { addFromCatalogue, fetchCatalogue } from '../../store/slices/seller';
import { Button, Input, Pill, Skeleton, TempBadge } from '../ui';
import { fieldErrors } from '../auth/Fields';
import SnackImage from '../ui/SnackImage';

const toPaise = (r) => Math.round(Number(r) * 100);
const spreadText = (p) => (!p?.shops ? 'No shop in your city sells it yet' : p.shops === 1 ? `1 shop in your city: ${rupees(p.minPaise)}` : `${p.shops} shops in your city: ${rupees(p.minPaise)} to ${rupees(p.maxPaise)}, most around ${rupees(p.medianPaise)}`);

/**
 * Add a snack from the shared catalogue (shared/domain/catalogue.js): search, pick an entry,
 * set your own price and prep time. The name, kind and details come from the entry, so every
 * shop's snack is the same one to customers comparing prices.
 */
export default function CataloguePicker({ onAdded, onOwnRecipe }) {
  const dispatch = useDispatch();
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [pick, setPick] = useState(null);
  const [form, setForm] = useState({ price: '', mrp: '', prep: '5', description: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      dispatch(fetchCatalogue(q.trim())).unwrap().then(setItems, () => setItems([]));
    }, 250);
    return () => clearTimeout(id);
  }, [dispatch, q]);

  const choose = (item) => {
    setPick(item);
    setErrors({});
    // start from the middle of what the city charges
    setForm({ price: item.pricesInCity?.medianPaise ? String(item.pricesInCity.medianPaise / 100) : '', mrp: '', prep: item.servingTemp === 'HOT' ? '10' : '4', description: '' });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const price = Number(form.price);
    const next = {};
    if (!(price * 100 >= MIN_PRICE_PAISE && price * 100 <= MAX_PRICE_PAISE)) next.price = `₹${MIN_PRICE_PAISE / 100} to ₹${MAX_PRICE_PAISE / 100}`;
    if (form.mrp !== '' && !(Number(form.mrp) >= price)) next.mrp = 'The MRP cannot be below the price';
    if (!(Number.isInteger(Number(form.prep)) && form.prep >= 1 && form.prep <= 60)) next.prep = '1 to 60 minutes';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const p = await dispatch(addFromCatalogue({ catalogItemId: pick.id, pricePaise: toPaise(price), prepMinutes: Number(form.prep), ...(form.mrp !== '' && { mrpPaise: toPaise(form.mrp) }), ...(form.description.trim() && { description: form.description.trim() }) })).unwrap();
      onAdded(p);
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors({ price: byField.pricePaise, mrp: byField.mrpPaise, prep: byField.prepMinutes, root: Object.keys(byField).length ? null : err.message });
    } finally {
      setSaving(false);
    }
  };

  if (pick) {
    return (
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
        <div className="flex items-center gap-3 sm:col-span-2">
          <SnackImage slug={pick.slug} art={pick.art} title={pick.title} plate={false} sizes="56px" className="h-14 w-14 rounded-xl" />
          <div>
            <p className="font-semibold">{pick.title}</p>
            <p className="text-sm text-grey-600">{[CATEGORY_LABELS[pick.category], pick.weight].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <p className="rounded-xl bg-grey-50 p-3 text-sm sm:col-span-2">{spreadText(pick.pricesInCity)}</p>
        <Input label="Your price (₹)" inputMode="decimal" value={form.price} onChange={set('price')} error={errors.price} />
        <Input label="MRP (₹, optional)" inputMode="decimal" value={form.mrp} onChange={set('mrp')} error={errors.mrp} />
        <Input label="Prep time (minutes)" inputMode="numeric" value={form.prep} onChange={set('prep')} error={errors.prep} />
        <Input label="Your description (optional)" maxLength={500} placeholder={pick.description ?? ''} value={form.description} onChange={set('description')} />
        {errors.root && <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text sm:col-span-2">{errors.root}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" loading={saving}>Add to my menu</Button>
          <Button type="button" variant="ghost" onClick={() => setPick(null)}>Back to the catalogue</Button>
        </div>
        <p className="text-xs text-grey-600 sm:col-span-2">It starts unlisted with no stock. Add stock, then tick “Listed”.</p>
      </form>
    );
  }

  return (
    <div>
      <Input label="Search the SnackHub catalogue" type="search" placeholder="Mirchi bajji, kaja, murukku…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto pr-1" aria-label="Catalogue snacks" aria-busy={items === null}>
        {items === null && [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-16" /></li>)}
        {items?.length === 0 && <li className="rounded-xl bg-grey-50 p-4 text-sm text-grey-600">Nothing in the catalogue by that name. You can add it as your own recipe.</li>}
        {items?.map((i) => (
          <li key={i.id}>
            <button type="button" disabled={Boolean(i.onMenu)} onClick={() => choose(i)} className="flex w-full items-center gap-3 rounded-xl border border-grey-800/10 p-2 text-left hover:border-orange/60 hover:bg-sun/10 disabled:cursor-default disabled:opacity-60 disabled:hover:border-grey-800/10 disabled:hover:bg-transparent">
              <SnackImage slug={i.slug} art={i.art} title={i.title} plate={false} sizes="48px" className="h-12 w-12 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold">{i.title} <TempBadge temp={i.servingTemp} />{i.onMenu && <Pill tone="green">On your menu</Pill>}</span>
                <span className="block text-xs text-grey-600">{spreadText(i.pricesInCity)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-grey-600">
        Not in the catalogue? <button type="button" onClick={onOwnRecipe} className="font-semibold text-orange-text underline underline-offset-2">Add your own recipe</button>
      </p>
    </div>
  );
}

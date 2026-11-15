import { useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { rupees } from '@shared/domain/money';
import { CATEGORIES, CATEGORY_LABELS, SHAPES } from '@shared/domain/menu';
import { createEntry, fetchCatalogue, linkProduct, updateEntry } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { Button, Card, Pill, TempBadge } from '../../components/ui';
import { useAdmin } from '../App';

const BLANK = { title: '', category: 'namkeen', servingTemp: 'AMBIENT', weight: '', spice: 0, shape: 'pile', description: '' };
const field = 'field h-11';
const spread = (p) => (!p?.shops ? '–' : p.shops === 1 ? rupees(p.minPaise) : `${rupees(p.minPaise)} to ${rupees(p.maxPaise)}`);

/**
 * The shared product catalogue (shared/domain/catalogue.js): one entry per snack that any
 * shop can sell at its own price. An edit here reaches every shop's copy of the snack; a
 * retired entry leaves the sellers' picker but stays on the menus that have it.
 */
const Catalogue = () => {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(null); // null | { id?, ...fields }
  const [productId, setProductId] = useState('');

  const load = useCallback(() => run(() => dispatch(fetchCatalogue({ q: q.trim(), all })).unwrap()).then((list) => list && setItems(list)), [dispatch, run, q, all]);
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  const edit = (i) => {
    setForm({ id: i.id, title: i.title, category: i.category, servingTemp: i.servingTemp, weight: i.weight ?? '', spice: i.spice, shape: i.art?.shape ?? 'pile', description: i.description ?? '', active: i.active, shops: i.prices?.shops ?? 0 });
    setProductId('');
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === 'spice' ? Number(e.target.value) : e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    const { id, active: _a, shops: _s, ...fields } = form;
    const body = { ...fields, weight: fields.weight.trim(), description: fields.description.trim() };
    const done = await run(() => dispatch(id ? updateEntry({ id, ...body }) : createEntry(body)).unwrap());
    if (!done) return;
    dispatch(addToast({ type: 'success', title: id ? 'Entry saved' : 'Entry added', message: id && form.shops ? `${done.title}: ${form.shops} shop${form.shops === 1 ? '' : 's'} updated.` : done.title }));
    setForm(null);
    load();
  };
  const setActive = async (active) => {
    const done = await run(() => dispatch(updateEntry({ id: form.id, active })).unwrap());
    if (!done) return;
    dispatch(addToast({ type: 'success', title: active ? 'Entry restored' : 'Entry retired', message: active ? 'Sellers can pick it again.' : 'Sellers can no longer add it; shops that sell it keep it.' }));
    setForm(null);
    load();
  };
  const link = async () => {
    const done = await run(() => dispatch(linkProduct({ id: form.id, productId: Number(productId) })).unwrap());
    if (!done) return;
    dispatch(addToast({ type: 'success', title: 'Linked', message: `Product #${productId} is now ${done.title}, at its shop’s own price.` }));
    setProductId('');
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Catalogue</h1>
          <p className="mt-1 max-w-3xl text-grey-600">One entry per snack. Shops pick from it and set their own price, prep time and stock; customers compare the shops near them. Editing an entry changes every shop’s copy.</p>
        </div>
        <Button onClick={() => setForm({ ...BLANK })}>Add an entry</Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="min-w-[240px] flex-1">
          <span className="sr-only">Search the catalogue</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className={field} />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-orange-deep" /> Show retired
        </label>
      </div>

      {form && (
        <Card className="mt-4 p-5" role="region" aria-label={form.id ? `Edit ${form.title}` : 'New entry'}>
          <h2 className="text-lg font-bold">{form.id ? `Edit #${form.id}` : 'New entry'}</h2>
          {form.id && form.shops > 0 && <p className="text-sm text-grey-600">{form.shops} shop{form.shops === 1 ? ' lists' : 's list'} it. Saving changes their copies too; prices stay theirs.</p>}
          <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="sm:col-span-2 lg:col-span-3"><span className="mb-1 block text-sm font-semibold">Name</span><input required minLength={3} maxLength={160} value={form.title} onChange={set('title')} className={field} /></label>
            <label><span className="mb-1 block text-sm font-semibold">Kind</span><select value={form.category} onChange={set('category')} className={field}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></label>
            <label><span className="mb-1 block text-sm font-semibold">Served</span><select value={form.servingTemp} onChange={set('servingTemp')} className={field}><option value="AMBIENT">Room temperature</option><option value="HOT">Hot</option></select></label>
            <label><span className="mb-1 block text-sm font-semibold">Pack size</span><input maxLength={20} value={form.weight} onChange={set('weight')} placeholder="200 g or 4 pcs" className={field} /></label>
            <label><span className="mb-1 block text-sm font-semibold">Spice</span><select value={form.spice} onChange={set('spice')} className={field}>{['None', 'Mild', 'Medium', 'Hot'].map((l, i) => <option key={l} value={i}>{l}</option>)}</select></label>
            <label><span className="mb-1 block text-sm font-semibold">Drawing</span><select value={form.shape} onChange={set('shape')} className={field}>{SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label className="sm:col-span-2 lg:col-span-3"><span className="mb-1 block text-sm font-semibold">Description</span><input maxLength={500} value={form.description} onChange={set('description')} className={field} /></label>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={form.title.trim().length < 3}>{form.id ? 'Save' : 'Add entry'}</Button>
              {form.id && <Button type="button" variant="ghost" onClick={() => setActive(!form.active)}>{form.active ? 'Retire' : 'Restore'}</Button>}
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Close</Button>
            </div>
          </form>
          {form.id && (
            <div className="mt-5 border-t border-grey-800/10 pt-4">
              <label className="block max-w-sm"><span className="mb-1 block text-sm font-semibold">Link a shop’s own recipe (product id)</span><input inputMode="numeric" value={productId} onChange={(e) => setProductId(e.target.value.replace(/\D/g, ''))} className={field} /></label>
              <Button className="mt-2" variant="ghost" size="sm" disabled={!productId} onClick={link}>Link to this entry</Button>
              <p className="mt-1 text-xs text-grey-600">The product takes this entry’s name and details and keeps its shop’s price and stock.</p>
            </div>
          )}
        </Card>
      )}

      <Card className="mt-4 overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Catalogue entries">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-grey-600"><tr className="border-b border-grey-800/5"><th className="p-3">Snack</th><th className="p-3">Kind</th><th className="p-3">Shops</th><th className="p-3">Prices</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Action</span></th></tr></thead>
          <tbody>
            {items?.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-grey-600">No entries match.</td></tr>}
            {(items ?? []).map((i) => (
              <tr key={i.id} className="border-b border-grey-800/5 last:border-0">
                <td className="p-3"><span className="font-semibold">{i.title}</span> <TempBadge temp={i.servingTemp} />{i.weight && <span className="block text-xs text-grey-600">{i.weight}</span>}</td>
                <td className="p-3">{CATEGORY_LABELS[i.category]}</td>
                <td className="p-3">{i.prices?.shops ?? 0}</td>
                <td className="p-3">{spread(i.prices)}</td>
                <td className="p-3">{i.active ? <Pill tone="green">In use</Pill> : <Pill tone="grey">Retired</Pill>}</td>
                <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => edit(i)}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {items?.length === 100 && <p className="mt-2 text-sm text-grey-600">Showing the first 100. Search to narrow it down.</p>}
    </div>
  );
};

export default Catalogue;

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { adjustStock, createProduct, fetchSellerProducts, updateProduct } from '../../store/slices/seller';
import { addToast } from '../../store/slices/toast';
import { isDemoSession } from '../../store/slices/auth';
import { rupees } from '@shared/domain/money';
import { Button, Card, CloseButton, Icon, Modal, TempBadge, Skeleton, cx } from '../../components/ui';
import SnackImage from '../../components/ui/SnackImage';
import ProductForm from '../../components/product/Form';

/** Products and stock adjustments (doc 11.2, 10.8); real sellers also add and edit snacks. */
const SellerProducts = () => {
  const dispatch = useDispatch();
  const { products, productsLoaded } = useSelector((state) => state.seller);
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const canEdit = !isDemoSession();

  useEffect(() => {
    dispatch(fetchSellerProducts());
  }, [dispatch]);

  const run = async (thunk, failTitle) => {
    try {
      return await dispatch(thunk).unwrap();
    } catch (e) {
      dispatch(addToast({ type: 'error', title: failTitle, message: e.message }));
      return null;
    }
  };
  const adjust = (p, delta, reason) => run(adjustStock({ id: p.id, delta, reason }), 'Stock not changed');
  const setListed = (p, active) => run(updateProduct({ id: p.id, active }), active ? 'Not listed' : 'Not hidden');
  const save = async (body) => {
    // the form shows field errors itself, so errors go back to it
    if (editing === 'new') await dispatch(createProduct(body)).unwrap();
    else await dispatch(updateProduct({ id: editing.id, ...body })).unwrap();
    dispatch(addToast({ type: 'success', title: editing === 'new' ? 'Snack added' : 'Snack saved', message: body.title }));
    setEditing(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Products and stock</h1>
          <p className="mt-1 text-sm text-grey-600">Stock edits are adjustments (plus or minus, with a reason) applied to the live count, so orders arriving at the same time are never overwritten.</p>
        </div>
        {canEdit && <Button onClick={() => setEditing('new')}><Icon name="plus" className="h-4 w-4" /> Add a snack</Button>}
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {!productsLoaded && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        {productsLoaded && products.length === 0 && (
          <Card className="p-6 text-center text-grey-600 md:col-span-2">
            <p className="font-bold text-grey-800">No snacks on your menu yet</p>
            <p className="mt-1 text-sm">Add your first snack, give it some stock and list it.</p>
          </Card>
        )}
        {products.map((p) => (
          <Card key={p.id} className={cx('flex gap-4 p-4', !p.active && 'opacity-75')}>
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sun/25 to-orange/10">
              <SnackImage slug={p.slug} art={p.art} title={p.title} plate={false} sizes="80px" className="h-20 w-20 rounded-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-bold">{p.title}</p>
                <TempBadge temp={p.servingTemp} />
                {canEdit && <button onClick={() => setEditing(p)} className="ml-auto h-8 rounded-full px-3 text-xs font-bold text-orange-text hover:bg-sun/20" aria-label={`Edit ${p.title}`}>Edit</button>}
              </div>
              <p className="text-sm text-grey-600">{[rupees(p.pricePaise), p.weight, `prep ${p.prepMinutes} min`].filter(Boolean).join(' · ')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cx('rounded-full px-2.5 py-1 text-sm font-extrabold', p.stock === 0 ? 'bg-red-strong text-white' : p.stock <= 3 ? 'bg-sun text-grey-800' : 'bg-grey-50')}>{p.stock === 0 ? 'Sold out' : `${p.stock} in stock`}</span>
                <div className="inline-flex overflow-hidden rounded-full ring-1 ring-grey-800/15" role="group" aria-label={`Adjust stock for ${p.title}`}>
                  <button className="h-9 w-10 font-black hover:bg-grey-50 disabled:opacity-40" disabled={p.stock === 0} onClick={() => adjust(p, -1, 'manual correction')} aria-label="Remove one">−</button>
                  <button className="h-9 w-12 border-x border-grey-800/10 text-sm font-bold hover:bg-grey-50" onClick={() => adjust(p, 5, 'new batch')} aria-label="Add 5">+5</button>
                  <button className="h-9 w-10 font-black hover:bg-grey-50" onClick={() => adjust(p, 1, 'manual correction')} aria-label="Add one">+</button>
                </div>
                <button onClick={() => adjust(p, -p.stock, 'item unavailable')} disabled={p.stock === 0} className="h-9 rounded-full px-3 text-xs font-bold text-red-text hover:bg-red/10 disabled:opacity-40">Mark unavailable</button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs font-bold text-grey-600">
                <input type="checkbox" checked={p.active} onChange={(e) => setListed(p, e.target.checked)} className="h-4 w-4 accent-orange-deep" /> Listed
              </label>
              {p.lastAdjust && <p className="mt-1 text-xs text-grey-600">Last change: {p.lastAdjust.delta > 0 ? '+' : ''}{p.lastAdjust.delta} ({p.lastAdjust.reason})</p>}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a snack' : 'Edit snack'} wide>
        <div className="relative p-5 sm:p-7">
          <CloseButton onClick={() => setEditing(null)} className="absolute right-3 top-3" />
          <h2 className="pr-10 text-2xl font-extrabold">{editing === 'new' ? 'Add a snack' : `Edit ${editing?.title ?? ''}`}</h2>
          <div className="mt-4">{editing && <ProductForm key={editing === 'new' ? 'new' : editing.id} product={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} />}</div>
        </div>
      </Modal>
    </div>
  );
};

export default SellerProducts;

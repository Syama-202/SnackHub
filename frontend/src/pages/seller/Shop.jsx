import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchShopProfile, updateShop } from '../../store/slices/seller';
import { Button, Card, Icon, Skeleton, cx } from '../../components/ui';

const SHOP_STEPS = ['draft', 'pending', 'probation', 'active'];

/** Verification status, busy mode and pause (doc 16.4, 11.2). */
const SellerShop = () => {
  const dispatch = useDispatch();
  const s = useSelector((state) => state.seller.shop);

  useEffect(() => {
    dispatch(fetchShopProfile());
  }, [dispatch]);

  if (!s) return <Skeleton className="h-64" />;
  const save = (changes) => dispatch(updateShop(changes));
  const expDays = s.licenceExpiresOn ? Math.round((new Date(s.licenceExpiresOn) - Date.now()) / 86400000) : null;
  const soon = expDays != null && expDays < 30;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-extrabold">{s.shopName}</h1>
        <p className="text-grey-600">{[s.city, s.region].filter(Boolean).join(', ')}</p>
        <Card className="mt-4 p-5">
          <h2 className="text-lg font-extrabold">Verification status</h2>
          <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {SHOP_STEPS.map((st, i) => {
              const reached = SHOP_STEPS.indexOf(s.status) >= i;
              return (
                <li key={st} className="flex items-center gap-2">
                  <span className={cx('rounded-full px-3 py-1 font-bold capitalize', s.status === st ? 'bg-grey-800 text-white' : reached ? 'bg-emerald-50 text-emerald-700' : 'bg-grey-50 text-grey-600')}>{st === 'pending' ? 'under review' : st}</span>
                  {i < SHOP_STEPS.length - 1 && <Icon name="arrowRight" className="h-4 w-4 text-grey-400" />}
                </li>
              );
            })}
          </ol>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-grey-600">Food licence</dt><dd className="font-mono font-bold">{s.licenceNo ?? '–'}</dd></div>
            <div><dt className="text-grey-600">Expires</dt><dd className={cx('font-bold', soon && 'text-red-text')}>{s.licenceExpiresOn ? `${s.licenceExpiresOn} (${expDays} days)` : '–'}</dd></div>
            <div><dt className="text-grey-600">Quality score</dt><dd className="font-bold">{s.qualityScore == null ? 'No ratings yet' : `${s.qualityScore} / 100`}</dd></div>
            <div><dt className="text-grey-600">Acceptance rate</dt><dd className="font-bold">{s.acceptanceRate == null ? '–' : `${Math.round(s.acceptanceRate * 100)}%`}</dd></div>
          </dl>
          {soon && <p className="mt-3 rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text">Your licence expires soon. The shop is suspended on the expiry date until a renewed licence is verified.</p>}
          <p className="mt-3 text-xs text-grey-600">The “Verified shop” badge shows only while your licence is valid and the shop is active. Below 70 warns, below 60 limits your reach, below 50 suspends.</p>
        </Card>
      </div>
      <Card className="p-5 lg:mt-16">
        <h2 className="text-lg font-extrabold">Busy mode</h2>
        <p className="text-sm text-grey-600">Add prep time when the kitchen is slammed, so the delivery time customers see stays honest. Shops that cannot make 30 minutes for an address are not shown there.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Extra prep minutes">
          {[0, 3, 6, 10].map((m) => (
            <button key={m} role="radio" aria-checked={s.busyExtraMin === m} onClick={() => save({ busyExtraMin: m })} className={cx('h-11 rounded-full px-4 font-bold', s.busyExtraMin === m ? 'bg-grey-800 text-white' : 'bg-grey-50')}>
              {m === 0 ? 'Normal' : `+${m} min`}
            </button>
          ))}
        </div>
        <h2 className="mt-6 text-lg font-extrabold">Pause the shop</h2>
        <p className="text-sm text-grey-600">Paused shops are hidden from customers. Open orders still need to be finished.</p>
        <Button className="mt-3" variant={s.paused ? 'primary' : 'outline'} onClick={() => save({ paused: !s.paused })}>{s.paused ? 'Resume taking orders' : 'Pause new orders'}</Button>
        <p className="mt-6 text-sm text-grey-600">Opening hours: <b>{s.openHours}</b> · Delivery radius: <b>{s.radiusKm} km</b> (hot snacks are capped at 3 km)</p>
      </Card>
    </div>
  );
};

export default SellerShop;

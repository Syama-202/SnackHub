import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTracking } from '../lib/useTracking';
import { Lane, laneStatus } from '../components/tracking/RiderLane';
import { TIMELINE, STATE_LABEL, customerCanCancel } from '../domain/orderStates';
import { rupees } from '../domain/money';
import { addToast } from '../store/slices/toastSlice';
import { cancelOrder, fetchOrders, fetchOtp, reviewOrder } from '../store/slices/orderSlice';
import { Button, Card, Icon, Pill, EmptyState, Spinner, cx } from '../components/ui';

const OrderTracking = () => {
  const { id } = useParams();
  const { track: t, isLoading, error } = useTracking(id);
  if (isLoading) return <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-8 w-8 text-orange-text" /></div>;
  if (error && !t) return <EmptyState title="Order not found" body="It may belong to another account." action={<Link to="/orders"><Button>Your orders</Button></Link>} />;
  const o = t.order;
  const terminal = ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <Link to="/orders" className="inline-flex h-11 items-center gap-1 text-sm font-bold text-grey-600 hover:text-grey-800"><Icon name="arrowLeft" className="h-4 w-4" /> Your orders</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-grey-600">Order #{o.id} · {o.seller?.shopName}</p>
          <h1 className="text-[clamp(2rem,5vw,3rem)] font-extrabold leading-tight">{STATE_LABEL[o.status]}</h1>
        </div>
        {!terminal && o.promiseWindow && (
          <div className="glass glass-strong px-4 py-2 text-right">
            <p className="text-xs font-bold text-grey-600">Promised by</p>
            <p className="font-display text-2xl font-extrabold">{new Date(o.promisedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
          </div>
        )}
      </div>

      {o.status === 'PENDING_PAYMENT' && (
        <p className="mt-4 rounded-2xl bg-sun/25 p-4 font-semibold">Waiting for payment confirmation. If you paid, this updates in a few seconds; unpaid orders are released after 10 minutes.</p>
      )}

      <div className="mt-6 overflow-hidden rounded-[28px] bg-grey-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 text-white">
          <p className="font-bold" aria-live="polite">{laneStatus(t)}</p>
          {t.simulated && <span className="rounded-full bg-sun px-2 py-0.5 text-[11px] font-extrabold uppercase text-grey-800">Simulated feed</span>}
        </div>
        {!['CANCELLED', 'REJECTED', 'PENDING_PAYMENT'].includes(o.status) && <Lane track={t} height={170} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          {!terminal && o.status !== 'PENDING_PAYMENT' && <DeliveryCode order={o} distanceM={t.distanceM} />}
          {o.status === 'DELIVERED' && <DeliveredPanel order={o} />}
          <Card className="p-5">
            <h2 className="text-xl font-extrabold">Timeline</h2>
            <Timeline order={o} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-xl font-extrabold">Order details</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {o.items.map((i) => (
                <li key={i.productId} className="flex justify-between"><span>{i.title} × {i.qty}</span><span className="font-bold">{rupees(i.unitPricePaise * i.qty)}</span></li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-grey-800/10 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-grey-600">Delivery fee</dt><dd>{rupees(o.deliveryFeePaise)}</dd></div>
              {o.creditPaise > 0 && <div className="flex justify-between text-emerald-700"><dt>App credit</dt><dd>−{rupees(o.creditPaise)}</dd></div>}
              <div className="flex justify-between text-base font-extrabold"><dt>Total</dt><dd>{rupees(o.totalPaise)}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone={o.paymentStatus === 'CAPTURED' || o.paymentStatus === 'COD_COLLECTED' ? 'green' : 'grey'}>{paymentLabel(o)}</Pill>
              <Pill tone={o.tempClass === 'HOT' ? 'red' : 'orange'}>{o.tempClass === 'HOT' ? 'Hot order' : 'Sweet and dry order'}</Pill>
            </div>
            <p className="mt-3 text-sm text-grey-600"><Icon name="pin" className="mr-1 inline h-4 w-4" />{o.addressText}</p>
            {o.rider && <p className="mt-2 text-sm text-grey-600"><Icon name="scooter" className="mr-1 inline h-4 w-4" />{o.rider.name} · {o.rider.vehicle} · ★ {o.rider.rating}</p>}
          </Card>
          <CancelBox order={o} />
        </div>
      </div>
    </div>
  );
};

function paymentLabel(o) {
  return { CAPTURED: 'Paid online', CREATED: 'Payment pending', COD_PENDING: 'Pay on delivery', COD_COLLECTED: 'Paid to rider', REFUND_PENDING: 'Refund in progress' }[o.paymentStatus] || o.paymentStatus;
}

/**
 * The delivery code stays hidden until the rider is near (doc 10.3).
 * The page asks /orders/:id/otp only once the server says it is revealed.
 */
function DeliveryCode({ order, distanceM }) {
  const dispatch = useDispatch();
  const code = useSelector((state) => state.orders.otp[order.id]);
  useEffect(() => {
    if (order.otpRevealed && !code) dispatch(fetchOtp(order.id));
  }, [order.otpRevealed, code, order.id, dispatch]);
  const unlocked = order.otpRevealed && code;
  return (
    <Card glass className={cx('p-5', unlocked && 'ring-4 ring-sun')}>
      <div className="flex items-start gap-4">
        <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', unlocked ? 'bg-sun text-grey-800' : 'bg-grey-800 text-white')}>
          <Icon name={unlocked ? 'unlock' : 'lock'} className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <h2 className="text-xl font-extrabold">Delivery code</h2>
          {unlocked ? (
            <>
              <p className="mt-1 text-grey-600">Share this with your rider at the door. It works only there.</p>
              <p className="mt-3 font-display text-5xl font-extrabold tracking-[0.3em] text-grey-800" aria-label={`Delivery code ${code.split('').join(' ')}`}>{code}</p>
            </>
          ) : (
            <p className="mt-1 text-grey-600">
              Your code appears when the rider is about 500 m away{distanceM ? ` (now ${(distanceM / 1000).toFixed(1)} km)` : ''}. Codes that show early can be shared with someone who is not at your door.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Timeline({ order }) {
  const reached = new Set(order.events.map((e) => e.to));
  const at = Object.fromEntries(order.events.map((e) => [e.to, e.at]));
  const steps = ['CANCELLED', 'REJECTED'].includes(order.status) ? [...TIMELINE.filter((s) => reached.has(s)), order.status] : TIMELINE;
  return (
    <ol className="mt-4 space-y-0">
      {steps.map((s, i) => {
        const done = reached.has(s);
        return (
          <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span className={cx('absolute left-[11px] top-6 h-full w-0.5', done ? 'bg-orange' : 'bg-grey-800/10')} aria-hidden="true" />}
            <span className={cx('relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full', done ? (s === 'CANCELLED' || s === 'REJECTED' ? 'bg-red-strong text-white' : 'bg-orange text-grey-800') : 'bg-grey-50 ring-2 ring-grey-800/10')}>
              {done && <Icon name="check" className="h-3.5 w-3.5" />}
            </span>
            <span className="flex-1">
              <span className={cx('block font-bold', !done && 'text-grey-600')}>{STATE_LABEL[s]}</span>
              {at[s] && <span className="text-xs text-grey-600">{new Date(at[s]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CancelBox({ order }) {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  if (!customerCanCancel(order.status)) return null;
  const cancel = async () => {
    if (!window.confirm('Cancel this order? Cancelling is free until the order is packed.')) return;
    setBusy(true);
    try {
      await dispatch(cancelOrder(order.id)).unwrap();
      dispatch(fetchOrders());
    } catch (e) {
      dispatch(addToast({ title: 'Could not cancel', message: e.message, type: 'error' }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-5">
      <p className="text-sm text-grey-600">Cancelling is free until the order is packed.</p>
      <Button variant="outline" className="mt-3 w-full" loading={busy} onClick={cancel}>Cancel order</Button>
    </Card>
  );
}

function DeliveredPanel({ order }) {
  const dispatch = useDispatch();
  const [rating, setRating] = useState(0);
  const [sent, setSent] = useState(false);
  const send = async (r) => {
    setRating(r);
    await dispatch(reviewOrder({ id: order.id, rating: r }));
    setSent(true);
  };
  return (
    <Card className="p-5">
      <h2 className="text-xl font-extrabold">How was the food?</h2>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rate the food">
        {[1, 2, 3, 4, 5].map((r) => (
          <button key={r} role="radio" aria-checked={rating === r} aria-label={`${r} star${r > 1 ? 's' : ''}`} onClick={() => send(r)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-sun/20">
            <Icon name="star" className={cx('h-7 w-7', r <= rating ? 'fill-sun text-sun' : 'text-grey-400')} />
          </button>
        ))}
      </div>
      {sent && <p className="mt-2 text-sm font-semibold text-emerald-700">Thanks. Ratings feed the shop’s quality score.</p>}
      <Link to={`/orders/${order.id}/report`} className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-red-text"><Icon name="flag" className="h-4 w-4" /> Report a problem</Link>
    </Card>
  );
}

export default OrderTracking;

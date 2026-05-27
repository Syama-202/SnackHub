import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTracking } from '../../hooks/useTracking';
import { laneStatus } from '../../components/tracking/RiderLane';
import { OrderMap } from '../../components/tracking/TrackMap';
import { TIMELINE, STATE_LABEL, customerCanCancel } from '@shared/domain/orderStates';
import { rupees } from '@shared/domain/money';
import { addToast } from '../../store/slices/toast';
import { cancelOrder, checkPayment, fetchOrders, fetchOtp, reviewOrder } from '../../store/slices/order';
import { useNow, usePageTitle, usePolling } from '../../hooks';
import { Button, Card, Icon, Pill, EmptyState, Spinner, cx } from '../../components/ui';

const OrderTracking = () => {
  const { id } = useParams();
  const { track: t, isLoading, error } = useTracking(id);
  const dispatch = useDispatch();
  // waiting for payment: the server asks PhonePe; the return from the pay page proves nothing
  usePolling(() => dispatch(checkPayment(id)), 4000, t?.order.status === 'PENDING_PAYMENT', 'order');
  usePageTitle(t ? `Order #${t.order.id}: ${STATE_LABEL[t.order.status]}` : null);
  if (isLoading) return <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-8 w-8 text-orange-text" /></div>;
  if (error && !t) return <EmptyState title="Order not found" body="It may belong to another account." action={<Link to="/orders"><Button>Your orders</Button></Link>} />;
  const o = t.order;
  const terminal = ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status);
  return (
    <div className="page page-narrow pt-6">
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

      {o.status === 'PENDING_PAYMENT' && <PaymentPending order={o} />}
      <PaymentNote order={o} />

      <div className="mt-6 overflow-hidden rounded-[28px] bg-grey-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 text-white">
          <p className="font-bold" aria-live="polite">{laneStatus(t)}</p>
          {t.simulated && <span className="rounded-full bg-sun px-2 py-0.5 text-[0.6875rem] font-extrabold uppercase text-grey-800">Simulated feed</span>}
        </div>
        {!['CANCELLED', 'REJECTED', 'PENDING_PAYMENT'].includes(o.status) && (
          <div className="p-3 pt-3">
            <OrderMap track={t} shopName={o.seller?.shopName} dropLabel="Your delivery address" height={320} />
          </div>
        )}
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
            <p className="mt-3 text-sm text-grey-600"><Icon name="pin" className="mr-1 inline h-4 w-4" />{o.addressDetail?.label ? <b className="text-grey-800">{o.addressDetail.label}: </b> : null}{o.addressText}</p>
            {o.addressDetail?.instructions && <p className="mt-1 text-sm text-grey-600">For the rider: {o.addressDetail.instructions}</p>}
            {o.rider && <p className="mt-2 text-sm text-grey-600"><Icon name="scooter" className="mr-1 inline h-4 w-4" />{[o.rider.name, o.rider.vehicle, o.rider.rating != null && `★ ${o.rider.rating}`].filter(Boolean).join(' · ')}</p>}
          </Card>
          <CancelBox order={o} />
        </div>
      </div>
    </div>
  );
};

const PAY_MODE = { UPI_INTENT: 'UPI app', UPI_COLLECT: 'UPI', UPI_QR: 'UPI QR', CARD: 'card', NET_BANKING: 'net banking' };

function paymentLabel(o) {
  const via = PAY_MODE[o.payment?.payMode];
  return {
    CAPTURED: via ? `Paid online by ${via}` : 'Paid online',
    CREATED: 'Waiting for payment',
    FAILED: o.paymentMode === 'COD' ? 'Not collected' : 'Payment failed',
    EXPIRED: 'Payment not completed',
    COD_PENDING: 'Pay on delivery',
    COD_COLLECTED: 'Paid to rider',
    REFUND_PENDING: 'Refund in progress',
    PARTIALLY_REFUNDED: 'Partly refunded',
    REFUNDED: 'Refunded',
  }[o.paymentStatus] || o.paymentStatus;
}

const isPhonePePage = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'phonepe.com' || u.hostname.endsWith('.phonepe.com'));
  } catch {
    return false;
  }
};

/** An online order waiting for PhonePe: confirming after a return, or a way back to the pay page. */
function PaymentPending({ order }) {
  const [params] = useSearchParams();
  const now = useNow(1000);
  const returning = params.get('payment') === 'return';
  const p = order.payment;
  const open = p?.redirectUrl && isPhonePePage(p.redirectUrl) && (!p.expiresAt || p.expiresAt > now);
  const minutes = p?.expiresAt ? Math.max(0, Math.ceil((p.expiresAt - now) / 60000)) : null;
  return (
    <div className="mt-4 rounded-2xl bg-sun/25 p-4" role="status" aria-live="polite">
      <p className="flex items-center gap-2 font-extrabold"><Spinner className="h-4 w-4" /> {returning ? 'Confirming your payment with PhonePe' : 'Waiting for your payment'}</p>
      <p className="mt-1 text-sm text-grey-800">
        {returning
          ? 'This page updates by itself as soon as PhonePe confirms it to us, usually within a few seconds. If the payment did not go through, nothing is charged.'
          : `The shop gets your order once the payment is confirmed.${minutes != null ? ` The payment page stays open for about ${minutes} more minute${minutes === 1 ? '' : 's'}.` : ''}`}
      </p>
      {open && (
        <a href={p.redirectUrl} className="mt-3 inline-flex h-10 items-center gap-1 rounded-full bg-grey-900 px-4 text-sm font-bold text-white">
          {returning ? 'Back to the payment page' : 'Continue to PhonePe'} <Icon name="arrowRight" className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

/** What happened to the money on an online order that did not go ahead, or was refunded. */
function PaymentNote({ order }) {
  const p = order.payment;
  if (!p || order.paymentMode !== 'ONLINE') return null;
  let text = null;
  if (['FAILED', 'EXPIRED'].includes(p.status)) text = 'The payment did not go through, so nothing was charged and the order was cancelled.';
  else if (p.refundPendingPaise > 0) text = `A refund of ${rupees(p.refundPendingPaise)} is on its way back to how you paid. PhonePe is processing it.`;
  else if (p.refundedPaise > 0) text = `${rupees(p.refundedPaise)} was refunded to how you paid.`;
  if (!text) return null;
  return <p className="mt-4 rounded-2xl bg-white/80 p-4 text-sm font-semibold shadow-sm">{text}</p>;
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
            {i < steps.length - 1 && <span className={cx('absolute left-[0.6875rem] top-6 h-full w-0.5', done ? 'bg-orange' : 'bg-grey-800/10')} aria-hidden="true" />}
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
  const [rating, setRating] = useState(order.review?.rating ?? 0);
  const [sent, setSent] = useState(Boolean(order.review));
  const send = async (r) => {
    if (sent) return;
    setRating(r);
    try {
      await dispatch(reviewOrder({ id: order.id, rating: r })).unwrap();
      setSent(true);
    } catch (e) {
      setRating(0);
      dispatch(addToast({ type: 'error', title: 'Rating not saved', message: e.message }));
    }
  };
  return (
    <Card className="p-5">
      <h2 className="text-xl font-extrabold">How was the food?</h2>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rate the food">
        {[1, 2, 3, 4, 5].map((r) => (
          <button key={r} role="radio" aria-checked={rating === r} aria-label={`${r} star${r > 1 ? 's' : ''}`} onClick={() => send(r)} disabled={sent} className="grid h-11 w-11 place-items-center rounded-full hover:bg-sun/20 disabled:hover:bg-transparent">
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

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { newIdempotencyKey } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { setAddress } from '../store/slices/uiSlice';
import { addToast } from '../store/slices/toastSlice';
import { fetchCart, updateQuantity } from '../store/slices/cartSlice';
import { createPayment, fetchOrders, fetchPaymentStatus, fetchQuote, placeOrder, reportPaymentFailure, verifyPayment } from '../store/slices/orderSlice';
import { rupees } from '@shared/domain/money';
import { PROMISE_WORDING } from '@shared/domain/promise';
import { Button, Card, Icon, Pill, EmptyState, TempBadge, Spinner, cx } from '../components/ui';
import SnackImage from '../components/SnackImage';
import RazorpayMock from '../components/RazorpayMock';

const METHODS = [
  { id: 'UPI', label: 'UPI', body: 'Any UPI app, through Razorpay', mode: 'ONLINE' },
  { id: 'CARD', label: 'Card', body: 'Debit or credit card, through Razorpay', mode: 'ONLINE' },
  { id: 'COD', label: 'Pay on delivery', body: 'Cash or UPI to the rider', mode: 'COD' },
];

const Checkout = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const addressId = useSelector((state) => state.ui.addressId);
  const addresses = useSelector((state) => state.profile.addresses);
  const cart = useSelector((state) => state.cart);
  const { quote: q, quoteLoading, quoteError } = useSelector((state) => state.orders);
  const [method, setMethod] = useState('UPI');
  const [simulate, setSimulate] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [problem, setProblem] = useState(null);
  const [payment, setPayment] = useState(null); // { order, payment }
  const [phase, setPhase] = useState('form'); // form | paying | confirming | failed
  const idem = useRef(newIdempotencyKey());
  const cartKey = cart.items.map((i) => `${i.productId}x${i.qty}`).join(',');

  // The server re-prices the cart and re-runs serviceability for this address
  useEffect(() => {
    if (cart.items.length) dispatch(fetchQuote({ addressId }));
  }, [dispatch, addressId, cartKey, cart.items.length]);

  // Prices, address or method changed: a new attempt gets a new idempotency key
  useEffect(() => {
    idem.current = newIdempotencyKey();
  }, [addressId, method, cart.subtotalPaise]);

  const mode = METHODS.find((m) => m.id === method).mode;
  const creditPaise = q && mode === 'COD' ? Math.min(q.creditPaise, q.subtotalPaise) : 0;
  const total = q ? q.subtotalPaise + q.deliveryFeePaise - creditPaise : 0;

  const place = async () => {
    setPlacing(true);
    setProblem(null);
    try {
      const { order } = await dispatch(placeOrder({ addressId, paymentMode: mode, simulate, idempotencyKey: idem.current })).unwrap();
      dispatch(fetchCart());
      dispatch(fetchOrders());
      if (mode === 'COD') {
        dispatch(addToast({ type: 'success', title: 'Order placed', message: 'Pay the rider at your door.' }));
        navigate(`/orders/${order.id}`);
        return;
      }
      const p = await dispatch(createPayment({ orderId: order.id })).unwrap();
      setPayment({ order, payment: p });
      setPhase('paying');
    } catch (e) {
      setProblem(e);
    } finally {
      setPlacing(false);
    }
  };

  const onPaid = async (res) => {
    setPhase('confirming');
    window.scrollTo(0, 0);
    try {
      // Browser fast path only. The order becomes PLACED when the webhook arrives.
      await dispatch(verifyPayment({ providerOrderId: payment.payment.providerOrderId, ...res })).unwrap();
    } catch (e) {
      setProblem(e);
      setPhase('failed');
    }
  };

  const onFailed = async ({ reason }) => {
    dispatch(reportPaymentFailure({ providerOrderId: payment.payment.providerOrderId, reason }));
    setProblem({ code: 'PAYMENT_FAILED', message: `${reason}. Your order is waiting for payment for 10 minutes; you can retry on the same order.` });
    setPhase('failed');
  };

  if (phase === 'confirming') return <Confirming orderId={payment.order.id} />;

  if (cart.isLoading && !cart.items.length) return <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-8 w-8 text-orange-text" /></div>;
  if (!cart.items.length && !payment)
    return <EmptyState title="Your cart is empty" body="Add snacks from a shop near you to check out." action={<Link to="/shop"><Button>Explore snacks</Button></Link>} />;

  const lines = cart.items.length ? cart.items : [];
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <h1 className="text-4xl font-extrabold">Checkout</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-xl font-extrabold">Deliver to</h2>
            <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Delivery address">
              {addresses.map((a) => (
                <label key={a.id} className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition', a.id === addressId ? 'border-orange bg-sun/10' : 'border-grey-800/10')}>
                  <input type="radio" name="addr" checked={a.id === addressId} onChange={() => dispatch(setAddress(a.id))} className="mt-1 h-4 w-4 accent-orange-deep" />
                  <span>
                    <span className="block font-bold">{a.label}</span>
                    <span className="block text-sm text-grey-600">{a.line}</span>
                  </span>
                </label>
              ))}
            </div>
            <Link to="/account" className="mt-2 inline-block text-sm font-bold text-orange-text">Add or edit addresses</Link>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-extrabold">Payment</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
              {METHODS.filter((m) => m.id !== 'COD' || q?.codEnabled !== false).map((m) => (
                <label key={m.id} className={cx('flex cursor-pointer flex-col rounded-2xl border-2 p-3 transition', method === m.id ? 'border-orange bg-sun/10' : 'border-grey-800/10')}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="pay" checked={method === m.id} onChange={() => setMethod(m.id)} className="h-4 w-4 accent-orange-deep" />
                    <span className="font-bold">{m.label}</span>
                  </span>
                  <span className="mt-1 text-xs text-grey-600">{m.body}</span>
                </label>
              ))}
            </div>
            {mode === 'COD' && q?.creditPaise > 0 && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">You have {rupees(q.creditPaise)} of app credit. It is applied to this pay-on-delivery order.</p>}
            <label className="mt-4 flex items-start gap-3 rounded-2xl bg-grey-50 p-3 text-sm">
              <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-deep" />
              <span>
                <b>Simulate the shop and rider</b> (demo). Turn this off to accept and pack the order yourself in the <Link className="font-bold text-orange-text underline" to="/seller" target="_blank">seller console</Link> and deliver it in the <Link className="font-bold text-orange-text underline" to="/rider" target="_blank">rider app</Link>.
              </span>
            </label>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card glass className="p-5">
            <h2 className="text-xl font-extrabold">Your order</h2>
            {(q?.seller || cart.seller) && <p className="text-sm text-grey-600">From {(q?.seller || cart.seller).shopName}</p>}
            <ul className="mt-3 divide-y divide-grey-800/5">
              {(lines.length ? lines : payment?.order.items.map((i) => ({ ...i, pricePaise: i.unitPricePaise, art: null })) || []).map((i) => (
                <li key={i.productId} className="flex items-center gap-3 py-2">
                  {i.art && <SnackImage slug={i.slug} art={i.art} title={i.title} plate={false} sizes="48px" className="h-10 w-12 rounded-md" />}
                  <span className="flex-1 text-sm"><b>{i.title}</b> × {i.qty}</span>
                  <span className="text-sm font-bold">{rupees(i.pricePaise * i.qty)}</span>
                </li>
              ))}
            </ul>
            {q && lines.length > 0 && (
              <>
                <dl className="mt-3 space-y-1 border-t border-grey-800/10 pt-3 text-sm">
                  <div className="flex justify-between"><dt className="text-grey-600">Subtotal</dt><dd className="font-bold">{rupees(q.subtotalPaise)}</dd></div>
                  <div className="flex justify-between"><dt className="text-grey-600">Delivery fee</dt><dd className="font-bold">{rupees(q.deliveryFeePaise)}</dd></div>
                  {creditPaise > 0 && <div className="flex justify-between text-emerald-700"><dt>App credit</dt><dd className="font-bold">−{rupees(creditPaise)}</dd></div>}
                  <div className="flex justify-between pt-1 text-lg"><dt className="font-extrabold">Total</dt><dd className="font-extrabold">{rupees(total)}</dd></div>
                </dl>
                <div className={cx('mt-4 rounded-2xl p-3 text-sm', q.promise.serviceable ? 'bg-white/70' : 'bg-red/10 text-red-text')}>
                  {q.promise.serviceable ? (
                    <>
                      <p className="flex items-center gap-2 font-extrabold"><Icon name="clock" className="h-4 w-4" /> Arrives in {q.promise.window[0]} to {q.promise.window[1]} min <TempBadge temp={q.tempClass} /></p>
                      <p className="mt-1 text-xs text-grey-600">{PROMISE_WORDING}</p>
                    </>
                  ) : (
                    <p className="font-bold">{q.promise.reasons[0]}. Try another address or shop.</p>
                  )}
                </div>
              </>
            )}
            {quoteLoading && !q && <div className="skeleton mt-4 h-24" />}
            {quoteError && !q && lines.length > 0 && <p role="alert" className="mt-4 rounded-2xl bg-red/10 p-3 text-sm font-bold text-red-text">{quoteError.message}</p>}

            {problem && <Problem problem={problem} onTake={(d) => dispatch(updateQuantity({ id: d.productId, sellerId: cart.sellerId, title: d.title }, d.available))} />}

            {phase === 'failed' && payment ? (
              <Button className="mt-4 w-full" size="lg" onClick={() => { setProblem(null); setPhase('paying'); }}>Retry payment</Button>
            ) : (
              <Button className="mt-4 w-full" size="lg" loading={placing} disabled={!q?.promise.serviceable || !lines.length} onClick={place}>
                {mode === 'COD' ? `Place order · ${rupees(total)}` : `Pay ${rupees(total)}`}
              </Button>
            )}
            <p className="mt-2 text-center text-xs text-grey-600">The server recalculates every price and reserves stock when you place the order.</p>
          </Card>
        </aside>
      </div>

      <RazorpayMock
        open={phase === 'paying'}
        payment={payment?.payment}
        method={method}
        onSuccess={onPaid}
        onFailure={onFailed}
        onDismiss={() => {
          setPhase('failed');
          setProblem({ code: 'PAYMENT_CANCELLED', message: 'Payment was cancelled. Your order waits 10 minutes for payment.' });
        }}
      />
    </div>
  );
};

function Problem({ problem, onTake }) {
  const d = problem.details;
  return (
    <div role="alert" className="mt-4 rounded-2xl bg-red/10 p-3 text-sm text-red-text">
      <p className="font-bold">{problem.message}</p>
      {problem.code === 'OUT_OF_STOCK' && d?.available > 0 && (
        <button onClick={() => onTake(d)} className="mt-2 rounded-full bg-white px-3 py-1.5 font-bold text-grey-800 shadow">Take {d.available} instead</button>
      )}
      {problem.code === 'OUT_OF_STOCK' && d?.available === 0 && <p className="mt-1">Remove it from your cart to continue. We never change quantities silently.</p>}
    </div>
  );
}

/** "Confirming" until the payment.captured webhook moves the order to PLACED. */
function Confirming({ orderId }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const status = useSelector((state) => state.orders.payment[orderId]);
  const done = status?.status === 'CAPTURED';
  usePolling(() => dispatch(fetchPaymentStatus(orderId)), 800, !done);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate(`/orders/${orderId}`, { replace: true }), 900);
    return () => clearTimeout(t);
  }, [done, navigate, orderId]);
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 text-center" aria-live="polite">
      <div>
        <div className={cx('mx-auto grid h-24 w-24 place-items-center rounded-full', done ? 'bg-emerald-500 text-white' : 'bg-sun/30 text-orange-text')}>
          {done ? <Icon name="check" className="h-12 w-12" /> : <Spinner className="h-12 w-12" />}
        </div>
        <h1 className="mt-6 text-3xl font-extrabold">{done ? 'Payment received' : 'Confirming your payment'}</h1>
        <p className="mt-2 text-grey-600">{done ? 'Your order is with the shop.' : 'We wait for Razorpay to confirm the payment on our server. This usually takes a few seconds. You can close this tab; the order is safe.'}</p>
        {!done && <Pill tone="grey" className="mt-4">Waiting for the signed webhook</Pill>}
      </div>
    </div>
  );
}

export default Checkout;

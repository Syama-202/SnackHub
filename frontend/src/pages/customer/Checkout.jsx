import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { newIdempotencyKey } from '../../services/api';
import { setAddress } from '../../store/slices/ui';
import { addToast } from '../../store/slices/toast';
import { fetchCart, updateQuantity } from '../../store/slices/cart';
import { fetchOrders, fetchQuote, placeOrder } from '../../store/slices/order';
import { rupees } from '@shared/domain/money';
import { Button, Card, Icon, Pill, EmptyState, TempBadge, Spinner, Modal, CloseButton, Textarea, cx } from '../../components/ui';
import AddressForm, { KIND_ICON } from '../../components/address/Form';
import { selectSavedAddress } from '../../store/slices/profile';
import { KIND_LABEL, addressSummary } from '@shared/domain/addresses';
import SnackImage from '../../components/ui/SnackImage';
import { PAY_PROVIDERS, providerName } from '../../constants/payments';

// what the server offers decides what shows (quote.paymentModes, quote.onlineProvider)
const methodsFor = (provider) => [
  { id: 'ONLINE', label: 'Pay online', body: PAY_PROVIDERS[provider]?.method ?? 'UPI or a card, on the payment provider’s secure page', mode: 'ONLINE' },
  { id: 'COD', label: 'Pay on delivery', body: 'Cash or UPI to the rider at your door', mode: 'COD' },
];

// PhonePe: the pay page must be PhonePe's own; anything else is never opened
const isPhonePePage = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'phonepe.com' || u.hostname.endsWith('.phonepe.com'));
  } catch {
    return false;
  }
};

const Checkout = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  // the chosen address, or the default one; checkout never sends an address that is not saved
  const addressId = useSelector(selectSavedAddress)?.id ?? null;
  const addresses = useSelector((state) => state.profile.addresses);
  const [adding, setAdding] = useState(false);
  const cart = useSelector((state) => state.cart);
  const { quote: q, quoteLoading, quoteError } = useSelector((state) => state.orders);
  const [method, setMethod] = useState('COD');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [problem, setProblem] = useState(null);
  const idem = useRef(newIdempotencyKey());
  const cartKey = cart.items.map((i) => `${i.productId}x${i.qty}`).join(',');

  // The server re-prices the cart and re-runs serviceability for this address
  useEffect(() => {
    if (cart.items.length && addressId) dispatch(fetchQuote({ addressId }));
  }, [dispatch, addressId, cartKey, cart.items.length]);

  // Prices, address or method changed: a new attempt gets a new idempotency key
  useEffect(() => {
    idem.current = newIdempotencyKey();
  }, [addressId, method, cart.subtotalPaise, note]);

  const provider = q?.onlineProvider ?? null;
  const offered = methodsFor(provider).filter((m) => q?.paymentModes?.includes(m.mode));
  const mode = offered.some((m) => m.id === method) ? method : (offered[0]?.mode ?? 'COD');
  const creditPaise = q && mode === 'COD' ? Math.min(q.creditPaise, q.subtotalPaise) : 0;
  const total = q ? q.subtotalPaise + q.deliveryFeePaise - creditPaise : 0;

  const place = async () => {
    setPlacing(true);
    setProblem(null);
    try {
      const { order } = await dispatch(placeOrder({ addressId, paymentMode: mode, note, idempotencyKey: idem.current })).unwrap();
      dispatch(fetchCart());
      dispatch(fetchOrders());
      if (mode === 'COD') {
        dispatch(addToast({ type: 'success', title: 'Order placed', message: 'Pay the rider at your door.' }));
        navigate(`/orders/${order.id}`);
        return;
      }
      // the order waits for the server to confirm the payment with the provider
      const p = order.payment;
      if (p?.checkout) {
        // Razorpay: its window opens over the order page, which then asks the server
        navigate(`/orders/${order.id}?pay=now`);
        return;
      }
      // PhonePe: off to its page
      const url = p?.redirectUrl;
      if (!isPhonePePage(url)) {
        setProblem({ code: 'PAYMENT_PAGE', message: 'The payment page did not open. Your order is waiting; try again from the order page.' });
        navigate(`/orders/${order.id}`);
        return;
      }
      window.location.assign(url);
    } catch (e) {
      setProblem(e);
    } finally {
      setPlacing(false);
    }
  };


  if (cart.isLoading && !cart.items.length) return <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-8 w-8 text-orange-text" /></div>;
  if (!cart.items.length)
    return <EmptyState icon="cart" title="Your cart is empty" body="Add snacks from a shop near you to check out." action={<Link to="/shop"><Button>Explore snacks</Button></Link>} />;

  const lines = cart.items.length ? cart.items : [];
  return (
    <div className="page page-narrow pt-6">
      <h1 className="page-title">Checkout</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-xl font-bold">Deliver to</h2>
            <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Delivery address">
              {!addresses.length && <p className="text-sm text-grey-600">Add a delivery address to check out.</p>}
            {addresses.map((a) => (
                <label key={a.id} className={cx('flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition', a.id === addressId ? 'border-orange bg-sun/10' : 'border-grey-800/10')}>
                  <input type="radio" name="addr" checked={a.id === addressId} onChange={() => dispatch(setAddress(a.id))} className="mt-1 h-4 w-4 accent-orange-deep" />
                  <Icon name={KIND_ICON[a.kind] ?? 'pin'} className="mt-0.5 h-5 w-5 shrink-0 text-orange-text" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {a.label}
                      {a.label !== KIND_LABEL[a.kind] && <span className="text-xs font-semibold text-grey-600">{KIND_LABEL[a.kind]}</span>}
                      {a.isDefault && <Pill tone="green">Default</Pill>}
                    </span>
                    <span className="block text-sm text-grey-600">{addressSummary(a)}</span>
                    {a.instructions && <span className="block text-xs text-grey-600">For the rider: {a.instructions}</span>}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={addresses.length >= 10}><Icon name="plus" className="h-4 w-4" /> New address</Button>
              <Link to="/account" className="inline-flex h-9 items-center px-2 text-sm font-semibold text-orange-text">Edit saved addresses</Link>
            </div>
            <Modal open={adding} onClose={() => setAdding(false)} title="Add an address" wide>
              <div className="relative p-5 sm:p-6">
                <CloseButton onClick={() => setAdding(false)} className="absolute right-3 top-3" />
                <h2 className="mb-4 text-2xl font-bold">Deliver somewhere new</h2>
                {adding && (
                  <AddressForm
                    onSaved={(saved) => {
                      if (saved) dispatch(setAddress(saved.id));
                      setAdding(false);
                    }}
                    onCancel={() => setAdding(false)}
                  />
                )}
              </div>
            </Modal>
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-bold">Payment</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
              {offered.map((m) => (
                <label key={m.id} className={cx('flex cursor-pointer flex-col rounded-2xl border-2 p-3 transition', mode === m.id ? 'border-orange bg-sun/10' : 'border-grey-800/10')}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="pay" checked={mode === m.id} onChange={() => setMethod(m.id)} className="h-4 w-4 accent-orange-deep" />
                    <span className="font-semibold">{m.label}</span>
                  </span>
                  <span className="mt-1 text-xs text-grey-600">{m.body}</span>
                </label>
              ))}
            </div>
            {q && !offered.some((m) => m.mode === 'ONLINE') && <p className="mt-3 text-xs text-grey-600">Online payment is not available right now. You pay the rider at your door, in cash or by UPI.</p>}
            {mode === 'ONLINE' && (
              <p className="mt-3 text-xs text-grey-600">
                You finish paying {PAY_PROVIDERS[provider]?.where ?? 'with the payment provider'}. Your UPI PIN and card details go to {providerName(provider)} only, never to SnackHub. The shop gets your order once {providerName(provider)} confirms the payment to us; if it does not go through in time, nothing is charged and the order is cancelled.
              </p>
            )}
            {mode === 'COD' && q?.creditPaise > 0 && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">You have {rupees(q.creditPaise)} of app credit. It is applied to this pay-on-delivery order.</p>}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card glass className="p-5">
            <h2 className="text-xl font-bold">Your order</h2>
            {(q?.seller || cart.seller) && <p className="text-sm text-grey-600">From {(q?.seller || cart.seller).shopName}</p>}
            <ul className="mt-3 divide-y divide-grey-800/5">
              {lines.map((i) => (
                <li key={i.productId} className="flex items-center gap-3 py-2">
                  {i.art && <SnackImage slug={i.slug} art={i.art} title={i.title} plate={false} sizes="48px" className="h-10 w-12 rounded-md" />}
                  <span className="flex-1 text-sm"><b>{i.title}</b> × {i.qty}</span>
                  <span className="text-sm font-semibold">{rupees(i.pricePaise * i.qty)}</span>
                </li>
              ))}
            </ul>
            {q && lines.length > 0 && (
              <>
                <dl className="mt-3 space-y-1 border-t border-grey-800/10 pt-3 text-sm">
                  <div className="flex justify-between"><dt className="text-grey-600">Subtotal</dt><dd className="font-semibold">{rupees(q.subtotalPaise)}</dd></div>
                  <div className="flex justify-between"><dt className="text-grey-600">Delivery fee</dt><dd className="font-semibold">{rupees(q.deliveryFeePaise)}</dd></div>
                  {creditPaise > 0 && <div className="flex justify-between text-emerald-700"><dt>App credit</dt><dd className="font-semibold">−{rupees(creditPaise)}</dd></div>}
                  <div className="flex justify-between pt-1 text-lg"><dt className="font-bold">Total</dt><dd className="font-bold">{rupees(total)}</dd></div>
                </dl>
                <div className={cx('mt-4 rounded-2xl p-3 text-sm', q.promise.serviceable ? 'bg-white/70' : 'bg-red/10 text-red-text')}>
                  {q.promise.serviceable ? (
                    <>
                      <p className="flex items-center gap-2 font-bold"><Icon name="clock" className="h-4 w-4" /> Arrives in {q.promise.window[0]} to {q.promise.window[1]} min <TempBadge temp={q.tempClass} /></p>
                      <p className="mt-1 text-xs text-grey-600">An estimate from the shop's distance and preparation time; traffic can change it.</p>
                    </>
                  ) : (
                    <p className="font-semibold">{q.promise.reasons[0]}. Try another address or shop.</p>
                  )}
                </div>
              </>
            )}
            {quoteLoading && !q && <div className="skeleton mt-4 h-24" />}
            {quoteError && !q && lines.length > 0 && <p role="alert" className="mt-4 rounded-2xl bg-red/10 p-3 text-sm font-semibold text-red-text">{quoteError.message}</p>}

            {problem && <Problem problem={problem} onTake={(d) => dispatch(updateQuantity({ id: d.productId, sellerId: cart.sellerId, title: d.title }, d.available))} />}

            <Textarea id="order-note" className="mt-4" label="Note for the shop" optional rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value.replace(/[<>]/g, ''))} placeholder="Less spicy, no onion…" hint="The kitchen sees this. Delivery directions go with your address." />

            {q?.blocked?.length > 0 && (
              <div role="status" className="mt-4 rounded-2xl bg-sun/20 p-3 text-sm text-grey-800">
                <p className="font-semibold">Some snacks can't be ordered right now</p>
                <ul className="mt-1 space-y-0.5">
                  {q.blocked.map((x) => <li key={x.productId}>{x.title}: {x.label}</li>)}
                </ul>
                <p className="mt-1 text-xs text-grey-600">Remove them from your cart to place the order, or come back then.</p>
              </div>
            )}
            <Button className="mt-4 w-full" size="lg" loading={placing} disabled={!addressId || !q?.promise.serviceable || !lines.length || !offered.length || q?.blocked?.length > 0} onClick={place}>
              {mode === 'COD' ? `Place order · ${rupees(total)}` : `Pay ${rupees(total)} with ${providerName(provider)}`}
            </Button>
            <p className="mt-2 text-center text-xs text-grey-600">The server recalculates every price and reserves stock when you place the order.</p>
          </Card>
        </aside>
      </div>

    </div>
  );
};

function Problem({ problem, onTake }) {
  const d = problem.details;
  return (
    <div role="alert" className="mt-4 rounded-2xl bg-red/10 p-3 text-sm text-red-text">
      <p className="font-semibold">{problem.message}</p>
      {problem.code === 'OUT_OF_STOCK' && d?.available > 0 && (
        <button onClick={() => onTake(d)} className="mt-2 rounded-full bg-white px-3 py-1.5 font-semibold text-grey-800 shadow">Take {d.available} instead</button>
      )}
      {problem.code === 'OUT_OF_STOCK' && d?.available === 0 && <p className="mt-1">Remove it from your cart to continue. We never change quantities silently.</p>}
    </div>
  );
}

export default Checkout;

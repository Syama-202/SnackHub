// Razorpay Standard Checkout in the browser (doc 10.9). The server creates the Razorpay order
// for the total it computed and sends only the public key id and that order's id
// (order.payment.checkout). Razorpay's script, loaded from Razorpay only when someone pays,
// opens its own window; card numbers and UPI PINs stay inside it. What the window reports
// proves nothing: afterwards the order page asks our server, which asks Razorpay.

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

/** Razorpay's script, added to the page once. */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay did not load')));
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Razorpay did not load'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Checkout data from our server, in the form it must have: a test key and a Razorpay order. */
export const isRazorpayCheckout = (c) => c?.provider === 'RAZORPAY' && /^rzp_test_[A-Za-z0-9]+$/.test(c.key ?? '') && /^order_[A-Za-z0-9]+$/.test(c.orderId ?? '');

/**
 * Opens Razorpay's window for one of our orders. onDone runs when Razorpay reports a payment,
 * onClose when the customer closes the window without paying. The window closes itself when
 * the payment time is up (expiresAt), so nobody pays for an order that was already given up.
 */
export async function openRazorpay(checkout, { orderId, expiresAt, user, onDone, onClose }) {
  if (!isRazorpayCheckout(checkout)) throw new Error('The payment details are not valid');
  const Razorpay = await loadRazorpay();
  const secondsLeft = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : null;
  if (secondsLeft != null && secondsLeft < 30) throw new Error('The time to pay for this order is over');
  const rzp = new Razorpay({
    key: checkout.key,
    order_id: checkout.orderId,
    amount: checkout.amountPaise,
    currency: checkout.currency || 'INR',
    name: 'SnackHub',
    description: `Order #${orderId}`,
    // saves typing; the customer can change them in the window
    prefill: {
      ...(user?.name && { name: user.name }),
      ...(user?.email && { email: user.email }),
      ...(user?.mobileVerified && user.mobile && { contact: user.mobile }),
    },
    theme: { color: '#FF7A00' },
    ...(secondsLeft != null && { timeout: secondsLeft }),
    // a failed attempt stays in the window, where the customer can try again
    retry: { enabled: true },
    modal: { confirm_close: true, ondismiss: () => onClose?.() },
    handler: () => onDone?.(),
  });
  rzp.open();
  return rzp;
}

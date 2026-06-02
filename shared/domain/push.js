/**
 * Push notifications (Web Push): the same messages as the in-app inbox, on the person's phone
 * or computer even when SnackHub is closed. A device subscribes per portal (customer, seller
 * or rider), so a seller's phone gets shop messages only.
 *
 * The server posts each message to the subscription's endpoint, so an endpoint must belong to
 * a known browser push service: anything else is refused, and the API can never be made to
 * call an address of someone's choosing.
 */
export const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, Samsung Internet
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows
  /^web\.push\.apple\.com$/, // Safari, and home-screen apps on iPhone
];

/** Whether a subscription endpoint is an https address at a known push service. */
export function pushEndpointOk(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443') && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

// at most this many devices per person and portal; the oldest makes room for a new one
export const MAX_DEVICES = 10;

/** Where a message can be acted on, per portal (the inbox links and push both use it); null for none. */
export function linkFor(portal, n) {
  if (portal === 'seller') return n.type?.startsWith('shop.payout') ? '/seller/payouts' : n.orderId ? '/seller' : null;
  if (portal === 'rider') return n.type?.startsWith('delivery.dispute') || n.type?.startsWith('delivery.cash') ? '/rider/earnings' : n.orderId ? '/rider' : null;
  return n.orderId ? `/orders/${n.orderId}` : null;
}
const INBOX = { customer: '/notifications', seller: '/seller/notifications', rider: '/rider/notifications' };

/**
 * What goes to the push service: a title, the inbox text and the link. Push services carry
 * the text encrypted; it never holds the delivery code (the inbox rule) and stays short.
 */
export const pushPayload = (portal, n) => ({
  title: portal === 'seller' ? 'SnackHub · your shop' : portal === 'rider' ? 'SnackHub · deliveries' : 'SnackHub',
  body: String(n.body).slice(0, 180),
  url: linkFor(portal, n) ?? INBOX[portal] ?? '/',
  tag: n.orderId ? `order-${n.orderId}` : n.type,
});

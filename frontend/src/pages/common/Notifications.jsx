import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { markAllRead } from '../../store/slices/notification';
import { Card, EmptyState, Icon, cx } from '../../components/ui';

// Each portal sees its own messages (the API filters them by the token's role) and each
// message leads to the place where it can be acted on
const PORTAL = {
  customer: {
    note: 'In-app messages. Notifications never contain your delivery code.',
    empty: 'Order updates show up here.',
    link: (n) => (n.orderId ? `/orders/${n.orderId}` : null),
  },
  seller: {
    note: 'New orders, cancellations and news about your shop.',
    empty: 'New orders and shop updates show up here.',
    link: (n) => (n.orderId ? '/seller' : null),
  },
  rider: {
    note: 'Deliveries, cancellations and pay updates.',
    empty: 'Delivery and pay updates show up here.',
    link: (n) => (n.type?.startsWith('delivery.dispute') ? '/rider/earnings' : n.orderId ? '/rider' : null),
  },
};

const Notifications = () => {
  const dispatch = useDispatch();
  const { items, loaded } = useSelector((state) => state.notifications);
  const role = useSelector((state) => state.auth.user?.role);
  const portal = PORTAL[role] ?? PORTAL.customer;
  // Mark everything read shortly after the page opens
  useEffect(() => {
    const t = setTimeout(() => dispatch(markAllRead()), 1500);
    return () => clearTimeout(t);
  }, [dispatch]);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <h1 className="text-4xl font-extrabold">Notifications</h1>
      <p className="mt-1 text-sm text-grey-600">{portal.note}</p>
      <div className="mt-6 space-y-2">
        {loaded && items.length === 0 && <EmptyState title="All quiet" body={portal.empty} />}
        {items.map((n) => {
          const to = portal.link(n);
          return (
            <Card key={n.id} as={to ? Link : 'div'} to={to ?? undefined} className={cx('flex items-start gap-3 p-4', !n.readAt && 'ring-2 ring-sun')}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun/30"><Icon name="bell" className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="font-bold">{n.body}</p>
                <p className="text-xs text-grey-600">{n.orderId ? `Order #${n.orderId} · ` : ''}{new Date(n.createdAt).toLocaleString([], { timeStyle: 'short', dateStyle: 'medium' })}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Notifications;

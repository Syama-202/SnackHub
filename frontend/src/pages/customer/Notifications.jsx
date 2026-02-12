import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { markAllRead } from '../../store/slices/notificationSlice';
import { Card, EmptyState, Icon, cx } from '../../components/ui';

const Notifications = () => {
  const dispatch = useDispatch();
  const { items, loaded } = useSelector((state) => state.notifications);
  // Mark everything read shortly after the page opens
  useEffect(() => {
    const t = setTimeout(() => dispatch(markAllRead()), 1500);
    return () => clearTimeout(t);
  }, [dispatch]);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <h1 className="text-4xl font-extrabold">Notifications</h1>
      <p className="mt-1 text-sm text-grey-600">In-app messages. Notifications never contain your delivery code.</p>
      <div className="mt-6 space-y-2">
        {loaded && items.length === 0 && <EmptyState title="All quiet" body="Order updates show up here." />}
        {items.map((n) => (
          <Card key={n.id} as={n.orderId ? Link : 'div'} to={n.orderId ? `/orders/${n.orderId}` : undefined} className={cx('flex items-start gap-3 p-4', !n.readAt && 'ring-2 ring-sun')}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun/30"><Icon name="bell" className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="font-bold">{n.body}</p>
              <p className="text-xs text-grey-600">{n.orderId ? `Order #${n.orderId} · ` : ''}{new Date(n.createdAt).toLocaleString([], { timeStyle: 'short', dateStyle: 'medium' })}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Notifications;

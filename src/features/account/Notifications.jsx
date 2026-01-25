import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useNotifications } from '../../lib/queries';
import { Card, EmptyState, Icon, cx } from '../../components/ui';

export default function Notifications() {
  const { data } = useNotifications();
  const qc = useQueryClient();
  useEffect(() => {
    const t = setTimeout(() => api('/me/notifications/read', { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })), 1500);
    return () => clearTimeout(t);
  }, [qc]);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <h1 className="text-4xl font-extrabold">Notifications</h1>
      <p className="mt-1 text-sm text-grey-600">In-app messages. Notifications never contain your delivery code.</p>
      <div className="mt-6 space-y-2">
        {data?.length === 0 && <EmptyState title="All quiet" body="Order updates show up here." />}
        {data?.map((n) => (
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
}

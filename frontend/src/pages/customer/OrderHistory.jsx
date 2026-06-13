import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchOlderOrders } from '../../store/slices/order';
import { STATE_LABEL, isActive } from '@shared/domain/orderStates';
import { rupees } from '@shared/domain/money';
import { Button, Card, EmptyState, Pill, Skeleton, Icon } from '../../components/ui';

// the newest orders come from CustomerLayout; this many means there may be older ones
const LATEST = 30;

/** Order history. The latest are kept fresh in the orders slice by CustomerLayout; older ones load a page at a time. */
const OrderHistory = () => {
  const dispatch = useDispatch();
  const { list: latest, listLoaded, older, olderDone } = useSelector((state) => state.orders);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const shown = new Set(latest.map((o) => o.id));
  const list = [...latest, ...older.filter((o) => !shown.has(o.id))];
  const more = listLoaded && latest.length >= LATEST && !olderDone;
  const loadMore = async () => {
    setLoading(true);
    setFailed(false);
    const res = await dispatch(fetchOlderOrders(list[list.length - 1].id));
    setFailed(fetchOlderOrders.rejected.match(res));
    setLoading(false);
  };
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6">
      <h1 className="text-4xl font-extrabold">Your orders</h1>
      <div className="mt-6 space-y-3">
        {!listLoaded && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
        {listLoaded && list.length === 0 && <EmptyState title="No orders yet" body="Your snack adventure starts here." action={<Link to="/shop"><Button>Explore snacks</Button></Link>} />}
        {list.map((o) => (
          <Card key={o.id} as={Link} to={`/orders/${o.id}`} className="lift flex flex-wrap items-center gap-4 p-4">
            <span className={`grid h-12 w-12 place-items-center rounded-2xl ${isActive(o.status) ? 'bg-primary' : 'bg-grey-50'}`}>
              <Icon name={isActive(o.status) ? 'scooter' : 'box'} className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{o.seller?.shopName} <span className="text-sm font-semibold text-grey-600">· #{o.id}</span></p>
              <p className="truncate text-sm text-grey-600">{o.items.map((i) => `${i.title} × ${i.qty}`).join(', ')}</p>
              <p className="text-xs text-grey-600">{new Date(o.placedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            <div className="text-right">
              <Pill tone={isActive(o.status) ? 'sun' : o.status === 'DELIVERED' ? 'green' : o.status === 'CANCELLED' || o.status === 'REJECTED' ? 'red' : 'grey'}>{STATE_LABEL[o.status]}</Pill>
              <p className="mt-1 font-extrabold">{rupees(o.totalPaise)}</p>
            </div>
          </Card>
        ))}
      </div>
      {more && (
        <div className="mt-6 text-center">
          {failed && <p role="alert" className="mb-2 text-sm font-semibold text-red-text">Could not load older orders. Try again.</p>}
          <Button variant="ghost" loading={loading} onClick={loadMore}>Show older orders</Button>
        </div>
      )}
    </div>
  );
};

export default OrderHistory;

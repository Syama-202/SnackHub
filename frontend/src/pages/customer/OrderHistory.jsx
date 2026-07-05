import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchOlderOrders, fetchOrders } from '../../store/slices/order';
import { STATE_LABEL, isActive } from '@shared/domain/orderStates';
import { rupees } from '@shared/domain/money';
import { Button, Card, EmptyState, ErrorState, Pill, Skeleton, Icon } from '../../components/ui';

// the newest orders come from CustomerLayout; this many means there may be older ones
const LATEST = 30;

/** Order history. The latest are kept fresh in the orders slice by CustomerLayout; older ones load a page at a time. */
const OrderHistory = () => {
  const dispatch = useDispatch();
  const { list: latest, listLoaded, listError, older, olderDone } = useSelector((state) => state.orders);
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
      <h1 className="page-title">Your orders</h1>
      <div className="mt-6 space-y-3">
        {!listLoaded && !listError && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[5.5rem]" />)}
        {!listLoaded && listError && <ErrorState title="We could not load your orders" onRetry={() => dispatch(fetchOrders())} />}
        {listLoaded && list.length === 0 && <EmptyState icon="receipt" title="No orders yet" body="Your snack adventure starts here." action={<Link to="/shop"><Button>Explore snacks</Button></Link>} />}
        {list.map((o) => (
          <Card key={o.id} as={Link} to={`/orders/${o.id}`} aria-label={`Order ${o.id} from ${o.seller?.shopName ?? 'a shop'}, ${STATE_LABEL[o.status]}`} className="lift flex items-center gap-3 p-4 sm:gap-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl sm:h-12 sm:w-12 ${isActive(o.status) ? 'bg-primary' : 'bg-grey-50'}`}>
              <Icon name={isActive(o.status) ? 'scooter' : 'box'} className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            {/* the shop name keeps to one line on a phone; the order number sits with the date */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{o.seller?.shopName}</p>
              <p className="truncate text-sm text-grey-600">{o.items.map((i) => `${i.title} × ${i.qty}`).join(', ')}</p>
              <p className="nums truncate text-xs text-grey-600">#{o.id} · {new Date(o.placedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            <div className="shrink-0 text-right">
              <Pill tone={isActive(o.status) ? 'sun' : o.status === 'DELIVERED' ? 'green' : o.status === 'CANCELLED' || o.status === 'REJECTED' ? 'red' : 'grey'}>{STATE_LABEL[o.status]}</Pill>
              <p className="nums mt-1 font-extrabold">{rupees(o.totalPaise)}</p>
            </div>
            <Icon name="chevronRight" className="hidden h-4 w-4 shrink-0 text-grey-400 sm:block" />
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

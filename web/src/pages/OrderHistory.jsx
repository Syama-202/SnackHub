import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { STATE_LABEL, isActive } from '@shared/domain/orderStates';
import { rupees } from '@shared/domain/money';
import { Button, Card, EmptyState, Pill, Skeleton, Icon } from '../components/ui';

/** Order history. The list is kept fresh in the orders slice by CustomerLayout. */
const OrderHistory = () => {
  const { list, listLoaded } = useSelector((state) => state.orders);
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
    </div>
  );
};

export default OrderHistory;

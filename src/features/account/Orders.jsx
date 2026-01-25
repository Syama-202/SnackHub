import { Link } from 'react-router-dom';
import { useOrders } from '../../lib/queries';
import { STATE_LABEL, isActive } from '../../domain/orderStates';
import { rupees } from '../../domain/money';
import { Button, Card, EmptyState, Pill, Skeleton, Icon } from '../../components/ui';

export default function Orders() {
  const { data, isLoading } = useOrders();
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6">
      <h1 className="text-4xl font-extrabold">Your orders</h1>
      <div className="mt-6 space-y-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
        {data?.length === 0 && <EmptyState title="No orders yet" body="Your snack adventure starts here." action={<Link to="/shop"><Button>Explore snacks</Button></Link>} />}
        {data?.map((o) => (
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
}

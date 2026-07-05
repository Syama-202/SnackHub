import { useDispatch, useSelector } from 'react-redux';
import { rupees } from '@shared/domain/money';
import { usePolling } from '../../hooks';
import { fetchPayouts } from '../../store/slices/seller';
import { Card, Pill, Skeleton } from '../../components/ui';

const when = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * What SnackHub owes the shop (doc 8.5): the food value of delivered orders past the complaint
 * window, less commission and fines, and every statement so far with its bank reference.
 */
const SellerPayouts = () => {
  const dispatch = useDispatch();
  const p = useSelector((state) => state.seller.payouts);
  usePolling(() => dispatch(fetchPayouts()), 60000, true, 'shop');

  if (!p) return <Skeleton className="h-64" />;
  const d = p.due;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="page-title">Payouts</h1>
      <p className="mt-1 text-grey-600">
        You are paid the food value of each delivered order, less SnackHub’s {p.commissionPct}% commission and any fines. Delivery fees and app credit are SnackHub’s, so you get the full food value however the customer paid. An order is payable {p.holdHours} hours after delivery, once its complaint window has closed.
      </p>

      <Card className="mt-6 p-5" role="region" aria-labelledby="due-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="due-h" className="text-lg font-extrabold">Payable now</h2>
          <p className="font-display text-4xl font-extrabold">{rupees(Math.max(0, d.netPaise))}</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div><dt className="text-grey-600">Food value</dt><dd className="font-bold">{rupees(d.grossPaise)}</dd></div>
          <div><dt className="text-grey-600">Commission</dt><dd className="font-bold">−{rupees(d.commissionPaise)}</dd></div>
          <div><dt className="text-grey-600">Fines</dt><dd className="font-bold">−{rupees(d.finesPaise)}</dd></div>
          <div><dt className="text-grey-600">Fines returned</dt><dd className="font-bold">+{rupees(d.returnedPaise)}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-grey-600">
          {d.ordersCount} order{d.ordersCount === 1 ? '' : 's'} ready.
          {d.waitingCount > 0 && ` ${d.waitingCount} more (${rupees(d.waitingGrossPaise)} food value) in the complaint window; the next becomes payable ${when(d.nextPayableAt)}.`}
        </p>
        <p className="mt-2 text-sm">
          {p.bank ? <>Paid to <b>{p.bank.holder}</b>, {p.bank.ifsc}, account ending <b>{p.bank.last4}</b>.</> : <span className="font-semibold text-red-text">No bank account on file yet. Add it in your shop application so payouts can be sent.</span>}
        </p>
      </Card>

      <h2 className="mt-8 text-xl font-extrabold">Statements</h2>
      <div className="mt-3 space-y-3">
        {p.payouts.length === 0 && <Card className="p-6 text-center text-grey-600">No statements yet. The first one comes once orders are payable.</Card>}
        {p.payouts.map((x) => (
          <Card key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-bold">Statement #{x.id} · {x.ordersCount} order{x.ordersCount === 1 ? '' : 's'}</p>
              <p className="text-sm text-grey-600">
                {rupees(x.grossPaise)} food − {rupees(x.commissionPaise)} commission{x.finesPaise ? ` − ${rupees(x.finesPaise)} fines` : ''}{x.returnedPaise ? ` + ${rupees(x.returnedPaise)} returned` : ''}
              </p>
              {x.reference && <p className="text-xs text-grey-600">Bank reference <span className="font-mono">{x.reference}</span>, {when(x.closedAt)}</p>}
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-extrabold">{rupees(x.netPaise)}</p>
              <Pill tone={x.status === 'PAID' ? 'green' : 'sun'}>{x.status === 'PAID' ? 'Paid' : 'Being prepared'}</Pill>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SellerPayouts;

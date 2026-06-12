import { useDispatch, useSelector } from 'react-redux';
import { rupees } from '@shared/domain/money';
import { usePolling } from '../../hooks';
import { fetchFailedRefunds, retryRefund } from '../../store/slices/admin';
import { addToast } from '../../store/slices/toast';
import { Button, Card } from '../../components/ui';
import { useAdmin } from '../App';

const when = (ms) => (ms ? new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '–');

/**
 * Refunds PhonePe refused (doc 10.9). The customer was told their refund is delayed. Check the
 * cause in the PhonePe dashboard (the reason code is shown), then send it again: that needs a
 * recent second factor, makes a new refund id, and the customer is refunded only once.
 */
const Refunds = () => {
  const dispatch = useDispatch();
  const { run } = useAdmin();
  const data = useSelector((state) => state.admin.failedRefunds);
  usePolling(() => dispatch(fetchFailedRefunds()), 30000);

  const retry = async (r) => {
    const res = await run(() => dispatch(retryRefund(r.id)).unwrap());
    if (!res) return;
    dispatch(addToast({ type: 'success', title: res.refundId ? 'Refund sent again' : 'Nothing left to refund', message: res.refundId ? `${rupees(res.amountPaise)} for order #${r.orderId}. Its status shows on the order.` : `Order #${r.orderId} has already been refunded in full.` }));
    dispatch(fetchFailedRefunds());
  };

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Failed refunds</h1>
      <p className="mt-1 max-w-3xl text-grey-600">
        Refunds PhonePe refused. The customer has been told theirs is delayed. Look up the reason code in the PhonePe dashboard, sort out the cause, then send the refund again.
      </p>
      {data && !data.providerEnabled && <p className="mt-4 rounded-2xl bg-sun/20 p-4 text-sm font-semibold">Online payments are not set up on this server, so refunds cannot be sent from here.</p>}

      <Card className="mt-6 overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Failed refunds">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-grey-600">
            <tr className="border-b border-grey-800/5"><th className="p-3">Order</th><th className="p-3">Refund</th><th className="p-3">Reason</th><th className="p-3">PhonePe said</th><th className="p-3">Failed</th><th className="p-3"><span className="sr-only">Action</span></th></tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan="6" className="p-6 text-center text-grey-600">Loading…</td></tr>}
            {data && data.refunds.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-grey-600">No failed refunds. Every refund went through or is still in progress.</td></tr>}
            {(data?.refunds ?? []).map((r) => (
              <tr key={r.id} className="border-b border-grey-800/5 last:border-0">
                <td className="p-3 font-bold">#{r.orderId}<span className="block text-xs font-normal text-grey-600">paid {rupees(r.paidPaise)}</span></td>
                <td className="p-3 font-extrabold">{rupees(r.amountPaise)}{r.complaintId && <span className="block text-xs font-normal text-grey-600">complaint #{r.complaintId}</span>}</td>
                <td className="p-3">{r.reason ?? '–'}</td>
                <td className="p-3 font-mono text-xs">{r.failureCode ?? '–'}</td>
                <td className="p-3 text-grey-600">{when(r.failedAt ?? r.createdAt)}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="ghost" disabled={!data.providerEnabled} onClick={() => retry(r)}>Send again</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default Refunds;

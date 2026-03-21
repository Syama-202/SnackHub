import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { disputeEarning, fetchEarnings } from '../../store/slices/rider';
import { isDemoSession } from '../../store/slices/auth';
import { addToast } from '../../store/slices/toast';
import { rupeesExact } from '@shared/domain/money';
import { Button, Card, Pill, Skeleton } from '../../components/ui';

/** Earnings: base, distance, bonus, penalty and net, with the inputs (doc 8.4a). */
const RiderEarnings = () => {
  const dispatch = useDispatch();
  const { earnings, earningsLoaded } = useSelector((state) => state.rider);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    dispatch(fetchEarnings());
  }, [dispatch]);

  const dispute = async (e) => {
    try {
      await dispatch(disputeEarning({ id: e.id, reason: 'Traffic diversion near the drop (demo)' })).unwrap();
      dispatch(addToast({ type: 'success', title: 'Dispute sent', message: 'An admin will review the order timeline.' }));
    } catch (err) {
      dispatch(addToast({ type: 'error', title: 'Cannot dispute', message: err.message }));
    }
  };

  const total = earnings.reduce((s, e) => s + e.netPaise, 0);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold">Earnings</h1>
      <Card className="mt-4 bg-hero p-5 text-grey-800">
        <p className="text-sm font-bold">Net this week</p>
        <p className="font-display text-4xl font-extrabold">{rupeesExact(total)}</p>
        <p className="text-sm">Pay = base + distance + on-time bonus − lateness cut. Only rider-caused delay counts; shop delay and a 2 minute grace are subtracted, the cut is capped, and net pay never goes below zero.</p>
      </Card>
      <div className="mt-4 space-y-3">
        {!earningsLoaded && <Skeleton className="h-28" />}
        {earnings.map((e) => {
          const i = e.inputs;
          // disputes reach an admin in the demo; for real accounts they come with the admin tools
          const canDispute = isDemoSession() && e.penaltyPaise > 0 && e.status === 'OK' && Date.now() - e.createdAt < 48 * 3600000;
          return (
            <Card key={e.id} className="p-4">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                <span>
                  <span className="block font-bold">Order #{e.orderId} {e.caseLabel && <span className="text-xs font-semibold text-grey-600">· worked case {e.caseLabel}</span>}</span>
                  <span className="text-xs text-grey-600">{new Date(e.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </span>
                <span className="text-right">
                  <span className="block font-extrabold">{rupeesExact(e.netPaise)}</span>
                  {e.penaltyPaise > 0 ? <Pill tone="red">−{rupeesExact(e.penaltyPaise)} late</Pill> : e.bonusPaise > 0 ? <Pill tone="green">On-time bonus</Pill> : null}
                  {e.status !== 'OK' && <Pill tone="sun" className="ml-1">{e.status.toLowerCase()}</Pill>}
                </span>
              </button>
              {open === e.id && (
                <div className="mt-3 border-t border-grey-800/10 pt-3 text-sm">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <dt className="text-grey-600">Base fee</dt><dd className="text-right">{rupeesExact(e.basePaise)}</dd>
                    <dt className="text-grey-600">Distance fee</dt><dd className="text-right">{rupeesExact(e.distancePaise)}</dd>
                    <dt className="text-grey-600">On-time bonus</dt><dd className="text-right">{rupeesExact(e.bonusPaise)}</dd>
                    <dt className="text-grey-600">Lateness cut</dt><dd className="text-right text-red-text">−{rupeesExact(e.penaltyPaise)}</dd>
                    <dt className="font-bold">Net</dt><dd className="text-right font-bold">{rupeesExact(e.netPaise)}</dd>
                  </dl>
                  <p className="mt-3 rounded-xl bg-grey-50 p-3 text-xs leading-relaxed text-grey-600">
                    Late by {Math.max(0, i.lateMin).toFixed(0)} min − shop delay {i.sellerDelayMin.toFixed(0)} − customer delay {i.customerDelayMin} − grace {i.graceMin} = <b>{i.riderLateMin.toFixed(0)} min</b> × {rupeesExact(i.ratePaisePerMin)}/min, capped at {rupeesExact(i.capPaise)} · policy v{i.policyVersion}
                  </p>
                  {canDispute && <Button size="sm" variant="outline" className="mt-3" onClick={() => dispute(e)}>Dispute this cut</Button>}
                  {e.penaltyPaise > 0 && !canDispute && e.status === 'OK' && <p className="mt-2 text-xs text-grey-600">{isDemoSession() ? 'Disputes close 48 hours after delivery.' : 'To question a cut, contact SnackHub support within 48 hours of the delivery.'}</p>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default RiderEarnings;

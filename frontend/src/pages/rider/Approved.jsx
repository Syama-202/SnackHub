import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import ConsoleLayout from '../../components/layout/Console';
import { Button, Card, Icon, Pill, Spinner, cx } from '../../components/ui';
import { loadOnboarding, setAvailability } from '../../store/slices/onboarding';

/**
 * The app for a real (not demo) rider. Being online is separate from being verified: going
 * online needs an approved application and valid documents, checked by the API each time.
 */
export default function RiderApproved() {
  const dispatch = useDispatch();
  const { view } = useSelector((s) => s.onboarding.rider);
  const { availability, workError } = useSelector((s) => s.onboarding);
  useEffect(() => {
    dispatch(loadOnboarding({ kind: 'rider' }));
  }, [dispatch]);

  if (!view) return <div className="grid min-h-[60vh] place-items-center text-orange-text" role="status"><Spinner className="h-8 w-8" /></div>;
  if (!['APPROVED', 'SUSPENDED'].includes(view.status)) return <Navigate to="/rider/onboarding" replace />;
  const online = availability === 'ONLINE';
  const expiring = view.documents.filter((d) => ['expiring', 'expired'].includes(d.expiry));

  return (
    <ConsoleLayout title="Rider app" tabs={[{ to: '/rider', label: 'Today', icon: 'scooter', end: true }]}>
      <div className="grid gap-5">
        <Card className={cx('p-6 text-center', online ? 'bg-emerald-50' : '')}>
          <Pill tone={online ? 'green' : 'grey'}>{online ? 'Online' : 'Offline'}</Pill>
          <h1 className="mt-3 text-3xl font-extrabold">{online ? 'You are online' : 'Ready when you are'}</h1>
          <p className="mt-1 text-grey-600">{online ? 'Delivery offers near you come here.' : 'Go online to receive delivery offers.'}</p>
          <Button size="lg" className="mt-5" variant={online ? 'ghost' : 'primary'} onClick={() => dispatch(setAvailability({ status: online ? 'OFFLINE' : 'ONLINE' }))}>
            <Icon name="scooter" /> {online ? 'Go offline' : 'Go online'}
          </Button>
          {workError && (
            <div className="mx-auto mt-4 max-w-md rounded-xl bg-red/10 p-3 text-left text-sm text-red-text" role="alert">
              <b>{workError.message}</b>
              {Array.isArray(workError.details?.reasons) && workError.details.reasons.length > 1 && (
                <ul className="mt-1 list-disc pl-5">
                  {workError.details.reasons.slice(1).map((r) => (
                    <li key={`${r.code}${r.docType ?? ''}`}>{r.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
        {expiring.length > 0 && (
          <Card className="p-5 text-sm">
            <b>Documents to renew:</b> {expiring.map((d) => `${d.label} (${d.expiry === 'expired' ? 'expired' : `expires ${d.expiresOn}`})`).join(', ')}. <Link to="/rider/onboarding" className="font-bold text-orange-text">Upload the renewal</Link>
          </Card>
        )}
        <Link to="/rider/onboarding" className="text-sm font-bold text-orange-text">Your documents and history</Link>
      </div>
    </ConsoleLayout>
  );
}

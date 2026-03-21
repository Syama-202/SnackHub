import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Spinner } from '../../components/ui';
import { loadOnboarding } from '../../store/slices/onboarding';

/**
 * The gate for a real (not demo) rider: until the application is approved it sends them to
 * onboarding. Being online is separate from being verified: going online and accepting an
 * offer need an approved application with valid documents, checked by the API each time.
 */
export default function RiderApproved({ children }) {
  const dispatch = useDispatch();
  const view = useSelector((s) => s.onboarding.rider.view);
  useEffect(() => {
    dispatch(loadOnboarding({ kind: 'rider' }));
  }, [dispatch]);
  if (!view) return <div className="grid min-h-[60vh] place-items-center text-orange-text" role="status"><Spinner className="h-8 w-8" /></div>;
  if (!['APPROVED', 'SUSPENDED'].includes(view.status)) return <Navigate to="/rider/onboarding" replace />;
  const expiring = view.documents.filter((d) => ['expiring', 'expired'].includes(d.expiry));
  return (
    <>
      {expiring.length > 0 && (
        <Card className="mx-auto mb-4 max-w-2xl p-4 text-sm">
          <b>Documents to renew:</b> {expiring.map((d) => `${d.label} (${d.expiry === 'expired' ? 'expired' : `expires ${d.expiresOn}`})`).join(', ')}. <Link to="/rider/onboarding" className="font-bold text-orange-text">Upload the renewal</Link>
        </Card>
      )}
      {children}
      <p className="mx-auto mt-6 max-w-2xl text-sm"><Link to="/rider/onboarding" className="font-bold text-orange-text">Your documents and history</Link></p>
    </>
  );
}

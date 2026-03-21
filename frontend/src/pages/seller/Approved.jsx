import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Icon, Pill, Spinner } from '../../components/ui';
import { loadOnboarding } from '../../store/slices/onboarding';

/**
 * The gate for a real (not demo) seller: until the application is approved it sends them to
 * onboarding. Once approved the console runs on the API, which checks the documents again on
 * every order it accepts and every snack it lists.
 */
export default function SellerApproved({ children }) {
  const dispatch = useDispatch();
  const view = useSelector((s) => s.onboarding.seller.view);
  useEffect(() => {
    dispatch(loadOnboarding({ kind: 'seller' }));
  }, [dispatch]);
  if (!view) return <div className="grid min-h-[60vh] place-items-center text-orange-text" role="status"><Spinner className="h-8 w-8" /></div>;
  if (!['APPROVED', 'SUSPENDED'].includes(view.status)) return <Navigate to="/seller/onboarding" replace />;
  return children;
}

/** Whether the shop may trade right now, and the documents that need renewing. */
export function Standing({ compact = false }) {
  const view = useSelector((s) => s.onboarding.seller.view);
  if (!view?.eligibility) return null;
  const eligible = view.eligibility.ok;
  const expiring = view.documents.filter((d) => ['expiring', 'expired'].includes(d.expiry));
  // on the order board only what needs attention shows
  if (compact && eligible && !expiring.length) return null;
  return (
    <Card className="mb-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold">{view.profile?.shopName}</h2>
        {eligible ? <Pill tone="green"><Icon name="shield" className="h-3.5 w-3.5" /> Verified and live</Pill> : <Pill tone="red">Not taking orders</Pill>}
      </div>
      {!eligible && (
        <ul className="mt-3 list-disc pl-5 text-sm text-red-text">
          {view.eligibility.reasons.map((r) => (
            <li key={`${r.code}${r.docType ?? ''}`}>{r.message}</li>
          ))}
        </ul>
      )}
      {expiring.length > 0 && (
        <p className="mt-3 rounded-xl bg-sun/25 p-3 text-sm">
          {expiring.map((d) => `${d.label} ${d.expiry === 'expired' ? 'has expired' : `expires on ${d.expiresOn}`}`).join('; ')}. <Link to="/seller/onboarding" className="font-bold text-orange-text">Upload the renewal</Link>
        </p>
      )}
      <Link to="/seller/onboarding" className="mt-3 inline-block text-sm font-bold text-orange-text">Your documents and history</Link>
    </Card>
  );
}

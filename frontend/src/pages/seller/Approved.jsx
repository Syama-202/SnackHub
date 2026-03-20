import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import ConsoleLayout from '../../components/layout/Console';
import { Button, Card, Icon, Pill, Price, Spinner } from '../../components/ui';
import { loadOnboarding, loadOwnProducts, setProductPublished } from '../../store/slices/onboarding';

/**
 * The console for a real (not demo) seller. Until the application is approved it sends them
 * to onboarding; once approved, publishing a snack still needs every required document to be
 * valid, which the API checks on every change.
 */
export default function SellerApproved() {
  const dispatch = useDispatch();
  const { view } = useSelector((s) => s.onboarding.seller);
  const { products, workError } = useSelector((s) => s.onboarding);
  useEffect(() => {
    dispatch(loadOnboarding({ kind: 'seller' }));
  }, [dispatch]);
  useEffect(() => {
    if (view?.status === 'APPROVED') dispatch(loadOwnProducts());
  }, [dispatch, view?.status]);

  if (!view) return <div className="grid min-h-[60vh] place-items-center text-orange-text" role="status"><Spinner className="h-8 w-8" /></div>;
  if (!['APPROVED', 'SUSPENDED'].includes(view.status)) return <Navigate to="/seller/onboarding" replace />;
  const eligible = view.eligibility.ok;
  const expiring = view.documents.filter((d) => ['expiring', 'expired'].includes(d.expiry));

  return (
    <ConsoleLayout title="Seller console" tabs={[{ to: '/seller', label: 'Shop', icon: 'box', end: true }]}>
      <div className="grid gap-5">
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold">{view.profile?.shopName}</h1>
            {eligible ? <Pill tone="green"><Icon name="shield" className="h-3.5 w-3.5" /> Verified and live</Pill> : <Pill tone="red">Paused</Pill>}
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
        <Card className="p-5">
          <h2 className="text-xl font-extrabold">Your snacks</h2>
          <p className="mt-1 text-sm text-grey-600">Published snacks appear to customers nearby. Orders reach this console once the order service is connected (this demo build runs orders in the browser mock).</p>
          {workError && <p className="mt-3 rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text" role="alert">{workError.message}</p>}
          {!products ? (
            <Spinner className="mt-4 h-6 w-6 text-orange-text" />
          ) : products.length === 0 ? (
            <p className="mt-4 text-sm text-grey-600">No snacks on your menu yet. Adding snacks is part of the next release; the SnackHub team can add your first menu for you.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 p-3 ring-1 ring-grey-800/10">
                  <span>
                    <span className="block font-bold">{p.title}</span>
                    <Price paise={p.pricePaise} className="text-sm" />
                  </span>
                  <Button size="sm" variant={p.active ? 'ghost' : 'primary'} disabled={!p.active && !eligible} onClick={() => dispatch(setProductPublished({ id: p.id, active: !p.active }))}>
                    {p.active ? 'Hide' : 'Publish'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </ConsoleLayout>
  );
}

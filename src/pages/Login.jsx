import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { signInWithGoogle } from '../store/slices/authSlice';
import { addToast } from '../store/slices/toastSlice';
import { Card, Icon, LogoMark, cx } from '../components/ui';
import GoogleG from '../components/GoogleG';

/**
 * Google sign-in (doc 16.1), simulated. Google always creates a customer.
 * Seller and rider are applications an admin approves, so the demo signs in
 * to seeded seller and rider accounts. Admin sign-in lives only on the
 * separate admin console.
 */
const ROLES = [
  { id: 'customer', title: 'Customer', body: 'Browse, order and track.', icon: 'user', to: '/shop' },
  { id: 'seller', title: 'Seller (approved demo shop)', body: 'Brodipet Mirchi Corner, Guntur.', icon: 'box', to: '/seller' },
  { id: 'rider', title: 'Rider (approved demo rider)', body: 'Offers, deliveries and earnings.', icon: 'scooter', to: '/rider' },
];

const Login = () => {
  const [params] = useSearchParams();
  const as = params.get('as') || 'customer';
  const next = params.get('next');
  const [role, setRole] = useState(as);
  const [busy, setBusy] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const current = useSelector((s) => s.auth.user);

  const signIn = async () => {
    setBusy(true);
    try {
      await dispatch(signInWithGoogle({ demoRole: role })).unwrap();
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      navigate(safeNext || ROLES.find((r) => r.id === role).to, { replace: true });
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Sign-in failed', message: e.message }));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-lg place-items-center px-4 py-10">
      <Card glass className="w-full p-6 sm:p-8">
        <LogoMark className="h-12 w-12" />
        <h1 className="mt-4 text-3xl font-extrabold">Sign in to SnackHub</h1>
        {current && current.role !== as && <p className="mt-2 rounded-xl bg-sun/25 p-3 text-sm">You are signed in as a {current.role}. This page needs a {as} account.</p>}
        <fieldset className="mt-5">
          <legend className="text-sm font-bold text-grey-600">Demo account</legend>
          <div className="mt-2 grid gap-2">
            {ROLES.map((r) => (
              <label key={r.id} className={cx('flex cursor-pointer items-center gap-3 rounded-2xl border-2 bg-white p-3 transition', role === r.id ? 'border-orange' : 'border-transparent ring-1 ring-grey-800/10')}>
                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
                <span className={cx('grid h-10 w-10 place-items-center rounded-xl', role === r.id ? 'bg-primary' : 'bg-grey-50')}><Icon name={r.icon} /></span>
                <span>
                  <span className="block font-bold">{r.title}</span>
                  <span className="block text-sm text-grey-600">{r.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button onClick={signIn} disabled={busy} className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-grey-800/15 bg-white font-bold text-grey-800 shadow-sm transition hover:shadow-md disabled:opacity-60">
          <GoogleG /> Continue with Google <span className="text-xs font-semibold text-grey-600">(demo)</span>
        </button>
        <p className="mt-4 text-xs leading-relaxed text-grey-600">
          Demo sign-in, no Google account is used. In the real app a new Google account is always a customer; sellers and riders apply and an admin approves them. Nobody can promote themselves. The admin console is a separate private app. <Link to="/" className="font-bold text-orange-deep">Back home</Link>
        </p>
      </Card>
    </div>
  );
};

export default Login;

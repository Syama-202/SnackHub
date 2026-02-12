import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import DemoBanner from '../components/layout/DemoBanner';
import Toast from '../components/ui/Toast';
import { Button, Card, Icon, Logo, Modal, cx } from '../components/ui';
import GoogleG from '../components/ui/GoogleG';
import { PageFallback } from '../routes/Guards';
import { logoutUser, restoreSession, signInWithGoogle, verifyAdminMfa } from '../store/slices/auth';
import { addToast } from '../store/slices/toast';
import LiveOps from './pages/LiveOps';
import Approvals from './pages/Approvals';
import Complaints from './pages/Complaints';
import PolicyEditor from './pages/PolicyEditor';
import AuditLog from './pages/AuditLog';

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

const TABS = [
  { to: '/', label: 'Live operations', icon: 'map', end: true },
  { to: '/approvals', label: 'Approvals', icon: 'shield' },
  { to: '/complaints', label: 'Complaints', icon: 'flag' },
  { to: '/policy', label: 'Delivery policy', icon: 'settings' },
  { to: '/audit', label: 'Audit log', icon: 'list' },
];

const AdminApp = () => {
  const dispatch = useDispatch();
  const { user, accessToken, isInitializing } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  // Step-up: an action that rejects with MFA_REQUIRED asks for the code again, then retries.
  // `action` returns a promise, usually dispatch(thunk(arg)).unwrap(). Resolves with its
  // result, or with undefined when it failed or the step-up was cancelled.
  const [stepUp, setStepUp] = useState(null);
  const run = useCallback(
    async (action) => {
      try {
        return await action();
      } catch (e) {
        if (e.code === 'MFA_REQUIRED') {
          return new Promise((resolve) =>
            setStepUp({
              retry: () =>
                action().then(resolve, (err) => {
                  dispatch(addToast({ type: 'error', title: 'Action failed', message: err.message }));
                  resolve(undefined);
                }),
              cancel: () => resolve(undefined),
            }),
          );
        }
        dispatch(addToast({ type: 'error', title: 'Action failed', message: e.message }));
        return undefined;
      }
    },
    [dispatch],
  );
  const cancelStepUp = () => {
    stepUp?.cancel();
    setStepUp(null);
  };

  if (isInitializing) return <PageFallback />;
  if (!accessToken || user?.role !== 'admin') return <AdminSignIn />;

  return (
    <AdminCtx.Provider value={{ run }}>
      <div className="min-h-dvh bg-console">
        <DemoBanner tone="dark" />
        <div className="flex">
          <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-grey-800/10 bg-white p-4 lg:flex">
            <Logo />
            <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-red-text">Admin · private host</p>
            <nav className="mt-6 grid gap-1" aria-label="Admin">
              {TABS.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold', isActive ? 'bg-grey-800 text-white' : 'text-grey-800 hover:bg-grey-50')}>
                  <Icon name={t.icon} className="h-4 w-4" /> {t.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto rounded-2xl bg-grey-50 p-3 text-xs text-grey-600">
              <p className="font-bold text-grey-800">{user.name}</p>
              <p>Signed in with Google + TOTP</p>
              <button onClick={() => dispatch(logoutUser())} className="mt-2 font-bold text-red-text">Sign out everywhere</button>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-grey-800/10 bg-white p-2 lg:hidden" aria-label="Admin">
              {TABS.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('h-10 shrink-0 rounded-full px-4 text-sm font-bold leading-10', isActive ? 'bg-grey-800 text-white' : 'text-grey-800')}>{t.label}</NavLink>
              ))}
            </nav>
            <main className="mx-auto max-w-7xl p-4 lg:p-8">
              <Routes>
                <Route index element={<LiveOps />} />
                <Route path="approvals" element={<Approvals />} />
                <Route path="complaints" element={<Complaints />} />
                <Route path="policy" element={<PolicyEditor />} />
                <Route path="audit" element={<AuditLog />} />
              </Routes>
            </main>
          </div>
        </div>
        <Modal open={Boolean(stepUp)} onClose={cancelStepUp} title="Confirm it is you">
          <div className="p-6">
            <p className="text-sm font-bold text-red-text">Confirm it is you</p>
            <p className="text-sm text-grey-600">This action needs a second-factor check from the last 5 minutes.</p>
            <MfaForm
              heading="Authenticator code"
              onDone={() => {
                const s = stepUp;
                setStepUp(null);
                s.retry();
              }}
            />
            <Button variant="quiet" className="mt-2 w-full" onClick={cancelStepUp}>Cancel</Button>
          </div>
        </Modal>
        <Toast />
      </div>
    </AdminCtx.Provider>
  );
};

/** Google sign-in returns a half-session (mfa_pending); no admin API accepts it. */
function AdminSignIn() {
  const dispatch = useDispatch();
  const { mfaPending, error, isLoading } = useSelector((state) => state.auth);
  return (
    <div className="min-h-dvh bg-console">
      <DemoBanner tone="dark" />
      <div className="mx-auto grid min-h-[80vh] max-w-md place-items-center px-4">
        <Card className="w-full p-8">
          <Logo />
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-red-text">Admin console · private host</p>
          {!mfaPending ? (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">Step 1 of 2: Google</h1>
              <p className="mt-1 text-sm text-grey-600">Your email must be verified and on the admin list.</p>
              <button onClick={() => dispatch(signInWithGoogle({ demoRole: 'admin' }))} disabled={isLoading} className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-grey-800/15 bg-white font-bold shadow-sm hover:shadow-md disabled:opacity-60">
                <GoogleG /> Continue with Google <span className="text-xs text-grey-600">(demo)</span>
              </button>
              {error && <p className="mt-3 text-sm font-bold text-red-text">{error}</p>}
            </>
          ) : (
            <MfaForm heading="Step 2 of 2: authenticator code" />
          )}
          <p className="mt-6 text-xs text-grey-600">Admin accounts come only from a seed list; there is no admin sign-up. Every login and MFA failure is written to the audit log.</p>
        </Card>
      </div>
    </div>
  );
}

function MfaForm({ heading, onDone }) {
  const dispatch = useDispatch();
  const isLoading = useSelector((state) => state.auth.isLoading);
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const input = useRef(null);
  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await dispatch(verifyAdminMfa({ code })).unwrap();
      onDone?.();
    } catch (e2) {
      setErr(e2.message);
      setCode('');
      input.current?.focus();
    }
  };
  return (
    <form onSubmit={submit} className="mt-6">
      <h2 className="text-2xl font-extrabold">{heading}</h2>
      <p className="mt-1 text-sm text-grey-600">Enter the 6-digit code from your authenticator app. Demo code: <b className="font-mono">246810</b></p>
      <label htmlFor="totp" className="sr-only">Authenticator code</label>
      <input ref={input} id="totp" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="mt-4 h-14 w-full rounded-2xl border-2 border-grey-800/15 text-center font-mono text-2xl tracking-[0.4em] focus:border-orange focus:outline-none" />
      {err && <p className="mt-2 text-sm font-bold text-red-text" role="alert">{err}</p>}
      <Button type="submit" className="mt-4 w-full" disabled={code.length !== 6} loading={isLoading}>Verify</Button>
      <p className="mt-3 text-xs text-grey-600">Passkey (WebAuthn) is the primary factor in the real console; TOTP is the fallback. 10 single-use recovery codes are stored hashed.</p>
    </form>
  );
}

export default AdminApp;

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import DemoBanner from '../components/layout/DemoBanner';
import Backdrop from '../components/ui/Backdrop';
import Toast from '../components/ui/Toast';
import { Button, Card, Icon, Logo, Modal, cx } from '../components/ui';
import GoogleG from '../components/ui/GoogleG';
import GoogleButton from '../components/ui/GoogleButton';
import { PageFallback } from '../routes/Guards';
import { GOOGLE_CLIENT_ID } from '../constants/auth';
import { adminStepUp, logoutUser, mfaCancelled, restoreSession, signInAdminWithGoogle, signInWithDemo, verifyAdminMfa } from '../store/slices/auth';
import { addToast } from '../store/slices/toast';
import LiveOps from './pages/LiveOps';
import Verification from './pages/Verification';
import Expiring from './pages/Expiring';
import Requirements from './pages/Requirements';
import Users from './pages/Users';
import Complaints from './pages/Complaints';
import PolicyEditor from './pages/PolicyEditor';
import AuditLog from './pages/AuditLog';
import Enrol from './pages/Enrol';
import { useRealtime } from '../hooks';
import ErrorBoundary from '../components/ui/ErrorBoundary';

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

// reviewers (the verification team) see only the queue and expiring documents
const TABS = [
  { to: '/', label: 'Live operations', icon: 'map', end: true, roles: ['admin'] },
  { to: '/verification', label: 'Verification', icon: 'shield', roles: ['admin', 'reviewer'] },
  { to: '/expiring', label: 'Expiring documents', icon: 'clock', roles: ['admin', 'reviewer'] },
  { to: '/requirements', label: 'Requirements', icon: 'file', roles: ['admin'] },
  { to: '/users', label: 'Accounts', icon: 'user', roles: ['admin'] },
  { to: '/complaints', label: 'Complaints', icon: 'flag', roles: ['admin'] },
  { to: '/policy', label: 'Delivery policy', icon: 'settings', roles: ['admin'] },
  { to: '/audit', label: 'Audit log', icon: 'list', roles: ['admin'] },
];
const STAFF = ['admin', 'reviewer'];

const AdminApp = () => {
  const dispatch = useDispatch();
  const { user, accessToken, isInitializing } = useSelector((state) => state.auth);
  const { pathname } = useLocation();

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);
  // the operations and complaints rooms, on the admin host only
  useRealtime();

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

  // the one-time enrolment link works before the admin can sign in
  if (pathname === '/enrol') return <Enrol />;
  if (isInitializing) return <PageFallback />;
  if (!accessToken || !STAFF.includes(user?.role)) return <AdminSignIn />;
  const tabs = TABS.filter((t) => t.roles.includes(user.role));

  return (
    <AdminCtx.Provider value={{ run }}>
      <div className="min-h-dvh">
        <Backdrop />
        <DemoBanner tone="dark" />
        <div className="flex">
          <aside className="glass glass-strong sticky top-3 m-3 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col p-4 lg:flex">
            <Logo />
            <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-red-text">{user.role === 'admin' ? 'Admin' : 'Verification team'} · private host</p>
            <nav className="mt-6 grid gap-1" aria-label="Admin">
              {tabs.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition', isActive ? 'chip-on' : 'text-grey-800 hover:bg-white/70')}>
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
            <nav className="glass glass-strong no-scrollbar m-2 flex gap-1 overflow-x-auto p-2 lg:hidden" aria-label="Admin">
              {tabs.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('h-10 shrink-0 rounded-full px-4 text-sm font-bold leading-10', isActive ? 'chip-on' : 'text-grey-800')}>{t.label}</NavLink>
              ))}
            </nav>
            <main className="page py-4 lg:py-8">
              {/* a crashed page keeps the console and its navigation around it */}
              <ErrorBoundary resetKey={pathname}>
                <Routes>
                  <Route index element={user.role === 'admin' ? <LiveOps /> : <Verification />} />
                  <Route path="verification" element={<Verification />} />
                  <Route path="expiring" element={<Expiring />} />
                  {user.role === 'admin' && (
                    <>
                      <Route path="requirements" element={<Requirements />} />
                      <Route path="users" element={<Users />} />
                      <Route path="complaints" element={<Complaints />} />
                      <Route path="policy" element={<PolicyEditor />} />
                      <Route path="audit" element={<AuditLog />} />
                    </>
                  )}
                  {/* the old approvals page is now the verification queue */}
                  <Route path="approvals" element={<Navigate to="/verification" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ErrorBoundary>
            </main>
          </div>
        </div>
        <Modal open={Boolean(stepUp)} onClose={cancelStepUp} title="Confirm it is you">
          <div className="p-6">
            <p className="text-sm font-bold text-red-text">Confirm it is you</p>
            <p className="text-sm text-grey-600">This action needs a second-factor check from the last 5 minutes.</p>
            <MfaForm
              heading="Authenticator code"
              stepUp
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

/**
 * Step 1 is Google: an account on the admin list gets a half-session (mfa_pending) that no
 * admin API accepts. Step 2 is the authenticator code (doc 16.3). Without a Google client
 * ID, or by choice, the demo admin runs entirely in the browser mock.
 */
function AdminSignIn() {
  const dispatch = useDispatch();
  const { mfaPending, error, isLoading } = useSelector((state) => state.auth);
  const demo = () => dispatch(signInWithDemo({ demoRole: 'admin' }));
  return (
    <div className="min-h-dvh">
      <Backdrop />
      <DemoBanner tone="dark" />
      <div className="mx-auto grid min-h-[80vh] max-w-md place-items-center px-4">
        <Card className="w-full p-8">
          <Logo />
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-red-text">Admin console · private host</p>
          {!mfaPending ? (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">Step 1 of 2: Google</h1>
              <p className="mt-1 text-sm text-grey-600">Your Google email must be verified and on the admin list.</p>
              <div className="mt-5">
                {GOOGLE_CLIENT_ID ? (
                  <GoogleButton disabled={isLoading} onCredential={(credential) => dispatch(signInAdminWithGoogle({ credential }))} />
                ) : (
                  <button onClick={demo} disabled={isLoading} className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-grey-800/15 bg-white font-bold shadow-sm hover:shadow-md disabled:opacity-60">
                    <GoogleG /> Continue with Google <span className="text-xs text-grey-600">(demo)</span>
                  </button>
                )}
              </div>
              {GOOGLE_CLIENT_ID && (
                <button onClick={demo} disabled={isLoading} className="mt-3 w-full text-center text-sm font-bold text-orange-text hover:underline">
                  Use the demo admin instead
                </button>
              )}
              {error && <p className="mt-3 text-sm font-bold text-red-text" role="alert">{error}</p>}
            </>
          ) : (
            <>
              <MfaForm heading="Step 2 of 2: authenticator code" demo={mfaPending.demo} />
              <button onClick={() => dispatch(mfaCancelled())} className="mt-3 text-sm font-bold text-grey-600 hover:underline">
                ← Use another Google account
              </button>
            </>
          )}
          <p className="mt-6 text-xs text-grey-600">There is no admin sign-up: the server owner creates admin accounts. Every login and wrong code is written to the audit log; five wrong codes lock the account for 15 minutes.</p>
        </Card>
      </div>
    </div>
  );
}

/** The 6-digit TOTP code, or one of the ten single-use recovery codes (xxxx-xxxx). */
function MfaForm({ heading, onDone, stepUp = false, demo }) {
  const dispatch = useDispatch();
  const isLoading = useSelector((state) => state.auth.isLoading);
  const tokenIsDemo = useSelector((state) => String(state.auth.accessToken || '').startsWith('demo.'));
  const isDemo = demo ?? tokenIsDemo;
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const ready = recovery ? /^[a-z2-9]{4}-[a-z2-9]{4}$/i.test(code) : code.length === 6;
  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await dispatch(stepUp ? adminStepUp({ code }) : verifyAdminMfa({ code })).unwrap();
      onDone?.();
    } catch (e2) {
      if (e2.code === 'MFA_SESSION_EXPIRED') dispatch(mfaCancelled());
      setErr(e2.message);
      setCode('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  const onChange = (v) => setCode(recovery ? v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 9) : v.replace(/\D/g, '').slice(0, 6));
  const toggle = () => {
    setRecovery(!recovery);
    setCode('');
    setErr(null);
  };
  return (
    <form onSubmit={submit} className="mt-6">
      <h2 className="text-2xl font-extrabold">{heading}</h2>
      <p className="mt-1 text-sm text-grey-600">
        {recovery ? 'Enter one of your recovery codes. Each works once, and the other admins are told it was used.' : 'Enter the 6-digit code from your authenticator app.'}
        {isDemo && !recovery && (
          <>
            {' '}Demo code: <b className="font-mono">246810</b>
          </>
        )}
      </p>
      <label htmlFor="totp" className="sr-only">{recovery ? 'Recovery code' : 'Authenticator code'}</label>
      <input
        ref={input}
        id="totp"
        autoFocus
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => onChange(e.target.value)}
        placeholder={recovery ? 'xxxx-xxxx' : undefined}
        className="mt-4 h-14 w-full rounded-2xl border-2 border-grey-800/15 text-center font-mono text-2xl tracking-[0.4em] focus:border-orange focus:outline-none"
      />
      {err && <p className="mt-2 text-sm font-bold text-red-text" role="alert">{err}</p>}
      <Button type="submit" className="mt-4 w-full" disabled={!ready} loading={busy || isLoading}>Verify</Button>
      {!isDemo && (
        <button type="button" onClick={toggle} className="mt-3 text-sm font-bold text-orange-text hover:underline">
          {recovery ? 'Use the authenticator app' : 'Lost your phone? Use a recovery code'}
        </button>
      )}
    </form>
  );
}

export default AdminApp;

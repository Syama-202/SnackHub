import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import DemoBanner from '../components/DemoBanner';
import Toaster from '../components/Toaster';
import { Button, Card, Icon, Logo, Modal, cx } from '../components/ui';
import GoogleG from '../components/GoogleG';
import LiveOps from './LiveOps';
import Approvals from './Approvals';
import Complaints from './Complaints';
import PolicyEditor from './PolicyEditor';
import AuditLog from './AuditLog';

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

const TABS = [
  { to: '/', label: 'Live operations', icon: 'map', end: true },
  { to: '/approvals', label: 'Approvals', icon: 'shield' },
  { to: '/complaints', label: 'Complaints', icon: 'flag' },
  { to: '/policy', label: 'Delivery policy', icon: 'settings' },
  { to: '/audit', label: 'Audit log', icon: 'list' },
];

export default function AdminApp({ actions }) {
  const dispatch = useDispatch();
  const token = useSelector((s) => s.auth.token);
  const user = useSelector((s) => s.auth.user);
  const toasts = useSelector((s) => s.ui.toasts);
  const qc = useQueryClient();
  const toast = useCallback((t) => dispatch(actions.toast(t)), [dispatch, actions]);

  // Step-up: a sensitive action answering 401 MFA_REQUIRED asks for the code again, then retries
  const [stepUp, setStepUp] = useState(null);
  const run = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (e) {
        if (e.code === 'MFA_REQUIRED') {
          return new Promise((resolve, reject) => setStepUp({ retry: () => fn().then(resolve, reject), cancel: () => reject(e) }));
        }
        toast({ title: 'Action failed', body: e.message, tone: 'error' });
        throw e;
      }
    },
    [toast],
  );

  if (!token || user?.role !== 'admin') return <AdminSignIn actions={actions} />;

  return (
    <AdminCtx.Provider value={{ run, toast, actions }}>
      <div className="console-bg min-h-dvh">
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
              <button onClick={() => { dispatch(actions.signedOut()); qc.clear(); }} className="mt-2 font-bold text-red-text">Sign out everywhere</button>
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
        <MfaModal
          open={Boolean(stepUp)}
          title="Confirm it is you"
          body="This action needs a second-factor check from the last 5 minutes."
          actions={actions}
          onDone={() => {
            const s = stepUp;
            setStepUp(null);
            s.retry();
          }}
          onCancel={() => {
            stepUp?.cancel();
            setStepUp(null);
          }}
        />
        <Toaster toasts={toasts} onDismiss={(id) => dispatch(actions.dismissToast(id))} />
      </div>
    </AdminCtx.Provider>
  );
}

/** Google sign-in returns a half-session (mfa_pending); no admin API accepts it. */
function AdminSignIn({ actions }) {
  const dispatch = useDispatch();
  const pending = useSelector((s) => s.auth.mfaPending);
  const [err, setErr] = useState(null);
  const google = async () => {
    setErr(null);
    try {
      const r = await api('/auth/google', { method: 'POST', body: { demoRole: 'admin' } });
      dispatch(actions.mfaPending({ user: r.user, halfToken: r.halfToken }));
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <div className="console-bg min-h-dvh">
      <DemoBanner tone="dark" />
      <div className="mx-auto grid min-h-[80vh] max-w-md place-items-center px-4">
        <Card className="w-full p-8">
          <Logo />
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-red-text">Admin console · private host</p>
          {!pending ? (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">Step 1 of 2: Google</h1>
              <p className="mt-1 text-sm text-grey-600">Your email must be verified and on the admin list.</p>
              <button onClick={google} className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-grey-800/15 bg-white font-bold shadow-sm hover:shadow-md">
                <GoogleG /> Continue with Google <span className="text-xs text-grey-600">(demo)</span>
              </button>
              {err && <p className="mt-3 text-sm font-bold text-red-text">{err}</p>}
            </>
          ) : (
            <MfaForm actions={actions} heading="Step 2 of 2: authenticator code" />
          )}
          <p className="mt-6 text-xs text-grey-600">Admin accounts come only from a seed list; there is no admin sign-up. Every login and MFA failure is written to the audit log.</p>
        </Card>
      </div>
    </div>
  );
}

function MfaForm({ actions, heading, onDone }) {
  const dispatch = useDispatch();
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api('/admin/auth/mfa', { method: 'POST', body: { code } });
      dispatch(actions.signedIn({ token: r.accessToken, user: r.user }));
      onDone?.();
    } catch (e2) {
      setErr(e2.message);
      setCode('');
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-6">
      <h2 className="text-2xl font-extrabold">{heading}</h2>
      <p className="mt-1 text-sm text-grey-600">Enter the 6-digit code from your authenticator app. Demo code: <b className="font-mono">246810</b></p>
      <label htmlFor="totp" className="sr-only">Authenticator code</label>
      <input ref={input} id="totp" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="mt-4 h-14 w-full rounded-2xl border-2 border-grey-800/15 text-center font-mono text-2xl tracking-[0.4em] focus:border-orange focus:outline-none" />
      {err && <p className="mt-2 text-sm font-bold text-red-text" role="alert">{err}</p>}
      <Button type="submit" className="mt-4 w-full" disabled={code.length !== 6} loading={busy}>Verify</Button>
      <p className="mt-3 text-xs text-grey-600">Passkey (WebAuthn) is the primary factor in the real console; TOTP is the fallback. 10 single-use recovery codes are stored hashed.</p>
    </form>
  );
}

function MfaModal({ open, onDone, onCancel, actions, title, body }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="p-6">
        <p className="text-sm font-bold text-red-text">{title}</p>
        <p className="text-sm text-grey-600">{body}</p>
        <MfaForm actions={actions} heading="Authenticator code" onDone={onDone} />
        <Button variant="quiet" className="mt-2 w-full" onClick={onCancel}>Cancel</Button>
      </div>
    </Modal>
  );
}

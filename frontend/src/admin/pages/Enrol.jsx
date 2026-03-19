import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../services/api';
import { Button, Card, Logo } from '../../components/ui';
import DemoBanner from '../../components/layout/DemoBanner';
import Backdrop from '../../components/ui/Backdrop';

/**
 * One-time enrolment link from `npm run create-admin` (doc 16.3): scan the QR code with an
 * authenticator app, prove it with the first code, then save the ten recovery codes, which
 * are shown only once. The link works for 15 minutes.
 */
export default function Enrol() {
  const navigate = useNavigate();
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // the token leaves the address bar, so it is not kept in history or shared by accident
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      setError('This page needs the enrolment link from the server owner.');
      return;
    }
    apiFetch('/admin/auth/enrol/info', { method: 'POST', body: { token }, retry: false }).then(setInfo, (e) => setError(e.message));
  }, [token]);

  const activate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/admin/auth/enrol', { method: 'POST', body: { token, code }, retry: false });
      setCodes(res.recoveryCodes);
    } catch (e2) {
      setError(e2.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([`SnackHub admin recovery codes for ${info?.email}\nEach works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'snackhub-admin-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-dvh">
      <Backdrop />
      <DemoBanner tone="dark" />
      <div className="mx-auto grid min-h-[80vh] max-w-md place-items-center px-4 py-8">
        <Card className="w-full p-8">
          <Logo />
          <p className="mt-1 text-xs font-extrabold uppercase tracking-wider text-red-text">Admin console · set up your second factor</p>

          {codes ? (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">Save your recovery codes</h1>
              <p className="mt-1 text-sm text-grey-600">If you lose your phone, each code signs you in once. They are shown only now; SnackHub keeps only a hash of each.</p>
              <ol className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-grey-50 p-4 font-mono text-base">
                {codes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="ghost" onClick={download}>Download as a file</Button>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy</Button>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-orange" />
                I have saved these codes somewhere safe
              </label>
              <Button className="mt-4 w-full" disabled={!saved} onClick={() => navigate('/', { replace: true })}>Go to sign in</Button>
            </>
          ) : info ? (
            <form onSubmit={activate}>
              <h1 className="mt-6 text-2xl font-extrabold">Scan with your authenticator app</h1>
              <p className="mt-1 text-sm text-grey-600">
                For <b>{info.email}</b>. Use Google Authenticator, Microsoft Authenticator or any TOTP app.
              </p>
              <img src={info.qr} alt="QR code for your authenticator app" width="240" height="240" className="mx-auto mt-4 rounded-xl border border-grey-800/10" />
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-bold text-orange-text">Cannot scan? Enter the key by hand</summary>
                <p className="mt-2 break-all rounded-xl bg-grey-50 p-3 font-mono">{info.secret}</p>
              </details>
              <label htmlFor="first-code" className="mt-5 block text-sm font-bold">Then enter the 6-digit code the app shows</label>
              <input
                id="first-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-2 h-14 w-full rounded-2xl border-2 border-grey-800/15 text-center font-mono text-2xl tracking-[0.4em] focus:border-orange focus:outline-none"
              />
              {error && <p className="mt-2 text-sm font-bold text-red-text" role="alert">{error}</p>}
              <Button type="submit" className="mt-4 w-full" disabled={code.length !== 6} loading={busy}>Turn on two-step sign-in</Button>
            </form>
          ) : (
            <>
              <h1 className="mt-6 text-2xl font-extrabold">Set up two-step sign-in</h1>
              {error ? <p className="mt-2 text-sm font-bold text-red-text" role="alert">{error}</p> : <p className="mt-2 text-sm text-grey-600">Checking your link…</p>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

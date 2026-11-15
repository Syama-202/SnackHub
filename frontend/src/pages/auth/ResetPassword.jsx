import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import AuthShell from '../../components/auth/Shell';
import { PasswordField } from '../../components/auth/Fields';
import { Button, Icon } from '../../components/ui';
import { resetPassword } from '../../store/slices/auth';
import { passwordProblems } from '@shared/domain/passwords';

/** A new password from the reset link. The link works once; every device is signed out. */
export default function ResetPassword() {
  const dispatch = useDispatch();
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token'));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // the token leaves the address bar (and the history) once the page has it
  useEffect(() => {
    if (params.get('token')) window.history.replaceState(null, '', '/reset-password');
  }, [params]);

  const problems = passwordProblems(password);
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('The passwords do not match');
    setBusy(true);
    const res = await dispatch(resetPassword({ token, password }));
    setBusy(false);
    if (resetPassword.fulfilled.match(res)) setDone(true);
    else setError(res.payload?.message);
  };

  if (done) {
    return (
      <AuthShell title="Password changed" sub="Every device was signed out. Sign in with the new password.">
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800"><Icon name="check" className="h-5 w-5" /> All set.</div>
        <Link to="/join" className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary font-semibold text-grey-800 shadow-cta">Sign in</Link>
      </AuthShell>
    );
  }
  if (!token) {
    return (
      <AuthShell title="This link is not complete" sub="Open the link from the email again, or ask for a new one.">
        <Link to="/forgot-password" className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary font-semibold text-grey-800 shadow-cta">Ask for a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <PasswordField label="New password" autoComplete="new-password" strength value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordField label="Confirm the new password" id="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && (
          <p className="rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text" role="alert">
            {error} {/expired|used/i.test(error) && <Link to="/forgot-password" className="font-semibold underline">Ask for a new link</Link>}
          </p>
        )}
        <Button type="submit" loading={busy} disabled={problems.length > 0 || !confirm}>Change password</Button>
      </form>
    </AuthShell>
  );
}

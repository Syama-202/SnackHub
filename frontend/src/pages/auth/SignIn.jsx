import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import AuthShell from '../../components/auth/Shell';
import { PasswordField } from '../../components/auth/Fields';
import { MfaEnrol, MfaVerify } from '../../components/auth/Mfa';
import RecoveryCodes from '../../components/auth/RecoveryCodes';
import GoogleButton from '../../components/ui/GoogleButton';
import { Button, Input } from '../../components/ui';
import { recoveryCodesSeen, resendVerification, signInWithGoogle, signInWithPassword } from '../../store/slices/auth';
import { ADMIN_CONSOLE_URL, GOOGLE_CLIENT_ID, PORTALS, signInPath, signUpPath } from '../../constants/auth';

const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null);

/**
 * Sign-in for one portal. A correct password leads to the code step when the account has an
 * authenticator, or to setting one up when the portal requires it (sellers); only then does
 * the session open. Errors never say whether an email has an account.
 */
export default function SignIn({ portal }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { user, mfaPending, recoveryCodes, isLoading } = useSelector((s) => s.auth);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState(null);
  const [notice, setNotice] = useState(null);
  const p = PORTALS[portal];

  const destination = next ?? p?.home ?? '/';
  // the session is open (and any new recovery codes were saved): go on
  useEffect(() => {
    if (user?.role === portal && !recoveryCodes && !mfaPending) navigate(destination, { replace: true });
  }, [user, portal, recoveryCodes, mfaPending, navigate, destination]);

  if (!p) return <Navigate to="/join" replace />;

  const submit = async (join = false) => {
    setProblem(null);
    setNotice(null);
    const res = await dispatch(signInWithPassword({ portal, identifier: identifier.trim(), password, join }));
    if (signInWithPassword.rejected.match(res)) setProblem(res.payload);
  };

  // the code step belongs to the portal it started in
  const pending = mfaPending && mfaPending.portal === portal ? mfaPending : null;

  if (recoveryCodes) {
    return (
      <AuthShell portal={portal} title="Two-step sign-in is on" sub="One last thing before you continue.">
        <RecoveryCodes codes={recoveryCodes} onDone={() => dispatch(recoveryCodesSeen())} doneLabel="I have saved them, continue" />
      </AuthShell>
    );
  }
  if (pending) {
    return (
      <AuthShell portal={portal} title={pending.purpose === 'enrol' ? 'Set up two-step sign-in' : 'Enter your code'}>
        {pending.purpose === 'enrol' ? <MfaEnrol portalLabel={p.label} /> : <MfaVerify />}
      </AuthShell>
    );
  }

  const otherPortals = Object.entries(PORTALS).filter(([id]) => id !== portal);
  return (
    <AuthShell
      portal={portal}
      title={`Sign in as a ${p.label.toLowerCase()}`}
      sub={portal === 'customer' ? 'Welcome back. Your cart is waiting.' : portal === 'seller' ? 'Manage your shop, menu and orders.' : 'Go online, take orders and track your earnings.'}
      footer={
        <div className="grid gap-2">
          <p>
            New to SnackHub? <Link to={signUpPath(portal)} className="font-semibold text-orange-text">Create a {p.label.toLowerCase()} account</Link>
          </p>
          <p>
            Not a {p.label.toLowerCase()}? {otherPortals.map(([id, o], i) => (
              <span key={id}>
                {i > 0 && ' or '}
                <Link to={signInPath(id)} className="font-semibold text-grey-800 underline decoration-orange/40 underline-offset-4">{o.label.toLowerCase()} sign-in</Link>
              </span>
            ))}
          </p>
        </div>
      }
    >
      {user && user.role !== portal && (
        <p className="mb-4 rounded-xl bg-sun/25 p-3 text-sm">You are signed in to the {user.role} portal. Signing in here switches this browser to the {p.label.toLowerCase()} portal.</p>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="grid gap-4"
      >
        <Input label="Email, or verified mobile with country code" type="text" inputMode="email" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com or +919876543210" />
        <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        <div className="-mt-2 text-right text-sm">
          <Link to="/forgot-password" className="font-semibold text-orange-text">Forgot password?</Link>
        </div>
        <Problem problem={problem} portal={portal} onJoin={() => submit(true)} onResend={async () => (await dispatch(resendVerification({ email: identifier.trim() })), setNotice('If that account still needs confirming, we have sent the link again.'))} />
        {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
        <Button type="submit" size="lg" loading={isLoading} disabled={!identifier || !password} className="w-full">
          Sign in
        </Button>
      </form>
      {portal === 'customer' && GOOGLE_CLIENT_ID && (
        <div className="mt-4">
          <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-grey-400"><span className="h-px flex-1 bg-grey-800/10" />or<span className="h-px flex-1 bg-grey-800/10" /></div>
          <GoogleButton disabled={isLoading} onCredential={async (credential) => {
            const res = await dispatch(signInWithGoogle({ credential }));
            if (signInWithGoogle.rejected.match(res)) setProblem(res.payload);
          }} />
        </div>
      )}
    </AuthShell>
  );
}

/** What went wrong, and the one next step that helps. */
function Problem({ problem, portal, onJoin, onResend }) {
  if (!problem) return null;
  const p = PORTALS[portal];
  const box = 'rounded-xl p-3 text-sm';
  if (problem.code === 'EMAIL_NOT_VERIFIED') {
    return (
      <div className={`${box} bg-sun/25`} role="alert">
        <b>Confirm your email first.</b> Open the link we sent when you signed up.{' '}
        <button type="button" onClick={onResend} className="font-semibold text-orange-text">Send it again</button>
      </div>
    );
  }
  if (problem.code === 'ROLE_NOT_HELD') {
    return (
      <div className={`${box} bg-white/80 ring-1 ring-grey-800/10`} role="alert">
        <b>This account has no {p.label.toLowerCase()} profile yet.</b> {portal === 'customer' ? 'You can add one and order snacks with the same login.' : 'Add one to this account; you will then fill in your details and documents for review.'}
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onJoin}>Add a {p.label.toLowerCase()} profile</Button>
      </div>
    );
  }
  if (problem.code === 'STAFF_ACCOUNT') {
    return (
      <div className={`${box} bg-grey-800 text-white`} role="alert">
        Staff accounts sign in on the admin console. <a href={ADMIN_CONSOLE_URL} className="font-semibold text-sun">Open the admin console</a>
      </div>
    );
  }
  return <p className={`${box} bg-red/10 font-semibold text-red-text`} role="alert">{problem.message}</p>;
}

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import AuthShell from '../../components/auth/Shell';
import { Button, Icon, Input, Spinner } from '../../components/ui';
import { resendVerification, verifyEmail } from '../../store/slices/auth';
import { signInPath } from '../../constants/auth';

/** The link from the confirmation email. It works once; an old link offers a new one. */
export default function VerifyEmail() {
  const dispatch = useDispatch();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState({ status: token ? 'checking' : 'invalid' });
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (!token || once.current) return;
    once.current = true;
    // the token leaves the address bar once it has been read
    window.history.replaceState(null, '', '/verify-email');
    dispatch(verifyEmail({ token })).then((res) => {
      if (verifyEmail.fulfilled.match(res)) setState({ status: 'done', portal: res.payload.portal });
      else setState({ status: 'invalid', message: res.payload?.message });
    });
  }, [dispatch, token]);

  if (state.status === 'checking') {
    return (
      <AuthShell title="Confirming your email">
        <div className="grid place-items-center py-8 text-orange-text" role="status"><Spinner className="h-8 w-8" /></div>
      </AuthShell>
    );
  }
  if (state.status === 'done') {
    return (
      <AuthShell portal={state.portal} title="Email confirmed" sub="Your account is ready. Sign in to continue.">
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <Icon name="check" className="h-5 w-5" /> Thanks. This address is now verified on your SnackHub account.
        </div>
        <Link to={signInPath(state.portal)} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary font-semibold text-grey-800 shadow-cta">Sign in</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="This link has expired" sub={state.message ?? 'Confirmation links work once and expire after 24 hours. Ask for a new one below.'}>
      {sent ? (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">If that account still needs confirming, a new link is on its way.</p>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await dispatch(resendVerification({ email: email.trim() }));
            setSent(true);
          }}
        >
          <Input label="Your email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={!email.includes('@')}>Send a new link</Button>
        </form>
      )}
      <Link to="/join" className="mt-4 inline-block text-sm font-semibold text-orange-text">Back to sign in</Link>
    </AuthShell>
  );
}

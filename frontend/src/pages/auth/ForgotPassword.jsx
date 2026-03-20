import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import AuthShell from '../../components/auth/Shell';
import { Button, Icon, Input } from '../../components/ui';
import { forgotPassword } from '../../store/slices/auth';

/** Asks for a reset link. The answer is the same whether or not the email has an account. */
export default function ForgotPassword() {
  const dispatch = useDispatch();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title="Reset your password" sub="Works for customer, seller and rider accounts. Staff reset theirs with the server owner.">
      {done ? (
        <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4 text-sm ring-1 ring-grey-800/10" role="status">
          <Icon name="mail" className="mt-0.5 h-5 w-5 shrink-0 text-orange-text" />
          <p>{done} The link works once and expires in 30 minutes. Resetting signs you out on every device.</p>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await dispatch(forgotPassword({ email: email.trim() }));
            setBusy(false);
            setDone(forgotPassword.fulfilled.match(res) ? res.payload.message : res.payload?.message);
          }}
        >
          <Input label="Email on your account" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={busy} disabled={!email.includes('@')}>Send the reset link</Button>
        </form>
      )}
      <Link to="/join" className="mt-5 inline-block text-sm font-bold text-orange-text">Back to sign in</Link>
    </AuthShell>
  );
}

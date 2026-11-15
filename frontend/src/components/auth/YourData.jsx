import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { deleteMyAccount, fetchMyData } from '../../store/slices/profile';
import { loadSecurity } from '../../store/slices/security';
import { logoutUser } from '../../store/slices/auth';
import { addToast } from '../../store/slices/toast';
import { DELETE_CONFIRM } from '@shared/domain/accounts';
import { Button, Card, Input, Modal } from '../ui';

/**
 * Your data (DPDP Act), on the profile page: download a copy of it, or delete the account.
 * Deleting asks for the word DELETE and, for an account with a password, the password.
 */
export default function YourData() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const download = async () => {
    setBusy(true);
    try {
      const data = await dispatch(fetchMyData()).unwrap();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'snackhub-my-data.json' });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Download failed', message: e.message }));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setWord('');
    setPassword('');
    setError('');
    setOpen(true);
    // a Google-only account has no password to ask for
    const s = await dispatch(loadSecurity()).unwrap().catch(() => null);
    if (s) setHasPassword(Boolean(s.hasPassword));
  };

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await dispatch(deleteMyAccount({ password: hasPassword ? password : undefined })).unwrap();
      setOpen(false);
      await dispatch(logoutUser());
      dispatch(addToast({ type: 'success', title: 'Account deleted', message: 'Your account and saved details are gone. We sent a confirmation email.' }));
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 pb-10" aria-labelledby="your-data-h">
      <h2 id="your-data-h" className="text-2xl font-bold">Your data</h2>
      <p className="text-sm text-grey-600">Download a copy of what SnackHub holds about you, or delete your account.</p>
      <Card className="mt-3 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Download my data</p>
          <p className="text-sm text-grey-600">Your profile, addresses, orders, favourites and notifications, as a JSON file.</p>
        </div>
        <Button variant="ghost" onClick={download} loading={busy && !open}>Download</Button>
      </Card>
      <Card className="mt-3 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Delete my account</p>
          <p className="text-sm text-grey-600">This cannot be undone. Records of past orders and payments are kept as the law requires.</p>
        </div>
        <Button variant="danger" onClick={start}>Delete account</Button>
      </Card>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Delete account">
        <form className="p-6" onSubmit={confirm}>
          <h2 className="text-2xl font-bold">Delete your account?</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-grey-600">
            <li>Your name, email, mobile, saved addresses, cart and favourites are erased.</li>
            <li>You are signed out everywhere and cannot sign in to this account again.</li>
            <li>Past orders stay in our records, without your details, as the law requires.</li>
          </ul>
          <div className="mt-5 space-y-3">
            <Input label={`Type ${DELETE_CONFIRM} to confirm`} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters" />
            {hasPassword && <Input label="Your password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-text">{error}</p>}
          <div className="mt-5 flex gap-2">
            <Button type="submit" variant="danger" loading={busy} disabled={word !== DELETE_CONFIRM || (hasPassword && !password)}>Delete for good</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Keep my account</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

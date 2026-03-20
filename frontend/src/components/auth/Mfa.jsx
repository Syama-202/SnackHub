import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Icon, Spinner } from '../ui';
import { CodeField } from './Fields';
import { confirmEnrolment, mfaCancelled, startEnrolment, verifyMfa } from '../../store/slices/auth';

/** The code step after a correct password: a code from the app, or a recovery code. */
export function MfaVerify({ onDone }) {
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((s) => s.auth);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const res = await dispatch(verifyMfa({ code: code.trim() }));
    if (verifyMfa.fulfilled.match(res)) onDone?.(res.payload);
    else setCode('');
  };
  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4 text-sm ring-1 ring-grey-800/10">
        <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <p>Your password was right. {recovery ? 'Enter one of your saved recovery codes; each works once.' : 'Now enter the 6-digit code from your authenticator app.'}</p>
      </div>
      <div className="mt-4">
        <CodeField recovery={recovery} value={code} onChange={(e) => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, ''))} error={error} autoFocus />
      </div>
      <Button type="submit" className="mt-5 w-full" loading={isLoading} disabled={recovery ? code.length < 9 : code.length !== 6}>
        Verify and sign in
      </Button>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" className="font-bold text-orange-text" onClick={() => (setRecovery((r) => !r), setCode(''))}>
          {recovery ? 'Use the app code instead' : 'Lost your phone? Use a recovery code'}
        </button>
        <button type="button" className="font-bold text-grey-600" onClick={() => dispatch(mfaCancelled())}>Start again</button>
      </div>
    </form>
  );
}

/**
 * Forced setup for a portal that requires an authenticator (sellers): scan the QR code,
 * confirm the first code, then save the recovery codes. The session opens only after the code.
 */
export function MfaEnrol({ portalLabel }) {
  const dispatch = useDispatch();
  const { enrolment, isLoading, error } = useSelector((s) => s.auth);
  const [code, setCode] = useState('');
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (!enrolment) dispatch(startEnrolment());
  }, [dispatch, enrolment]);
  const submit = async (e) => {
    e.preventDefault();
    const res = await dispatch(confirmEnrolment({ code }));
    if (!confirmEnrolment.fulfilled.match(res)) setCode('');
  };
  if (!enrolment) {
    return (
      <div className="grid place-items-center py-10 text-orange-text" role="status">
        {error ? <p className="text-sm font-semibold text-red-text">{error}</p> : <Spinner className="h-8 w-8" />}
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate>
      <p className="text-sm text-grey-600">
        {portalLabel} accounts handle money and customers, so they always use two-step sign-in. Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or similar) and scan this code.
      </p>
      <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
        <img src={enrolment.qr} alt="QR code for your authenticator app" width="180" height="180" className="mx-auto rounded-2xl bg-white p-2 ring-1 ring-grey-800/10" />
        <div className="text-sm">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open the app and add an account.</li>
            <li>Scan the QR code.</li>
            <li>Type the 6-digit code it shows.</li>
          </ol>
          <button type="button" className="mt-3 font-bold text-orange-text" onClick={() => setShowKey((s) => !s)}>{showKey ? 'Hide the setup key' : "Can't scan? Type a setup key instead"}</button>
          {showKey && <p className="mt-2 break-all rounded-xl bg-grey-50 p-2 font-mono text-xs">{enrolment.secret}</p>}
        </div>
      </div>
      <div className="mt-5">
        <CodeField value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={error} />
      </div>
      <Button type="submit" className="mt-5 w-full" loading={isLoading} disabled={code.length !== 6}>
        Turn on two-step sign-in
      </Button>
      <button type="button" className="mt-4 text-sm font-bold text-grey-600" onClick={() => dispatch(mfaCancelled())}>Cancel</button>
    </form>
  );
}

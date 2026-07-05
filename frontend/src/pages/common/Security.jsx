import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Card, Icon, Input, Pill, Spinner } from '../../components/ui';
import { CodeField, PasswordField, Select } from '../../components/auth/Fields';
import RecoveryCodes from '../../components/auth/RecoveryCodes';
import { changePassword, codesSeen, confirmMfaSetup, disableMfa, endSession, loadSecurity, logoutEverywhere, regenerateRecoveryCodes, setupCancelled, startMfaSetup, startMobile, verifyMobile } from '../../store/slices/security';
import { isDemoSession } from '../../store/slices/auth';
import { addToast } from '../../store/slices/toast';
import { COUNTRY_CODES } from '../../constants/auth';
import { passwordProblems } from '@shared/domain/passwords';

const ROLE_LABEL = { customer: 'Customer', seller: 'Seller', rider: 'Delivery partner', reviewer: 'Reviewer', admin: 'Admin' };
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
// "Chrome on Windows" from the stored user agent, enough to recognise a device
function deviceName(ua) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'another system';
  return `${browser} on ${os}`;
}

/** Security settings for every role: password, two-step sign-in, mobile and sessions. */
export default function Security() {
  const dispatch = useDispatch();
  const { data, loading, error, recoveryCodes } = useSelector((s) => s.security);
  const demo = isDemoSession();
  useEffect(() => {
    if (!demo) dispatch(loadSecurity());
  }, [dispatch, demo]);

  if (demo) {
    return (
      <div className="page py-10">
        <Card className="max-w-xl p-6">
          <h1 className="text-2xl font-extrabold">Security and sign-in</h1>
          <p className="mt-2 text-grey-600">The demo account has no password, authenticator or sessions to manage. Create a real account to try these settings.</p>
        </Card>
      </div>
    );
  }
  if (loading || !data) return <div className="grid min-h-[40vh] place-items-center text-orange-text" role="status">{error ? <p className="text-red-text">{error.message}</p> : <Spinner className="h-8 w-8" />}</div>;

  return (
    <div className="page page-narrow py-8">
      <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-orange-text">Your account</p>
      <h1 className="mt-1 page-title">Security and sign-in</h1>
      {recoveryCodes && (
        <Card className="mt-6 p-6">
          <h2 className="text-xl font-extrabold">Your new recovery codes</h2>
          <div className="mt-4"><RecoveryCodes codes={recoveryCodes} onDone={() => dispatch(codesSeen())} /></div>
        </Card>
      )}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-xl font-extrabold">Account</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="font-bold text-grey-600">Email</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-2">{data.email} {data.emailVerified ? <Pill tone="green">Verified</Pill> : <Pill tone="red">Not verified</Pill>}</dd>
            </div>
            <div>
              <dt className="font-bold text-grey-600">Roles on this account</dt>
              <dd className="mt-1 flex flex-wrap gap-2">
                {data.roles.map((r) => (
                  <Pill key={r.role} tone={r.status === 'active' ? 'orange' : 'grey'}>{ROLE_LABEL[r.role]}{r.status !== 'active' ? ' (suspended)' : ''}</Pill>
                ))}
              </dd>
            </div>
          </dl>
          <MobileSection data={data} />
        </Card>
        <TwoStep data={data} />
        <PasswordSection hasPassword={data.hasPassword} email={data.email} />
        <Sessions data={data} />
      </div>
    </div>
  );
}

function MobileSection({ data }) {
  const dispatch = useDispatch();
  const [countryCode, setCountryCode] = useState('+91');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  return (
    <div className="mt-5 border-t border-grey-800/10 pt-4">
      <h3 className="font-bold">Mobile number</h3>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        {data.mobile ?? 'None yet'} {data.mobile && (data.mobileVerified ? <Pill tone="green">Verified</Pill> : <Pill>Not verified</Pill>)}
      </p>
      {!data.smsEnabled ? (
        <p className="mt-2 text-sm text-grey-600">Text-message codes are not set up on this server yet, so numbers cannot be verified or used to sign in. Email works as usual.</p>
      ) : sent ? (
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await dispatch(verifyMobile({ code }));
            if (verifyMobile.fulfilled.match(res)) {
              setSent(false);
              dispatch(addToast({ type: 'success', title: 'Mobile verified' }));
            } else setError(res.payload?.message);
          }}
        >
          <CodeField label="Code from the text message" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={error} id="sms-code" />
          <Button type="submit" size="sm" disabled={code.length !== 6}>Verify number</Button>
        </form>
      ) : (
        <form
          className="mt-3 grid grid-cols-[7.5rem_1fr] gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const res = await dispatch(startMobile({ countryCode, mobile }));
            if (startMobile.fulfilled.match(res)) setSent(true);
            else setError(res.payload?.message);
          }}
        >
          <Select label="Country" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} id="sec-cc">
            {COUNTRY_CODES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Input label={data.mobile ? 'New number' : 'Number'} inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} error={error} id="sec-mobile" />
          <Button type="submit" size="sm" className="col-span-2" disabled={mobile.length < 6}>Text me a code</Button>
        </form>
      )}
    </div>
  );
}

function TwoStep({ data }) {
  const dispatch = useDispatch();
  const setup = useSelector((s) => s.security.setup);
  const [code, setCode] = useState('');
  const [action, setAction] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (thunk) => {
    setBusy(true);
    setError(null);
    const res = await dispatch(thunk({ code: code.trim() }));
    setBusy(false);
    if (res.meta.requestStatus === 'fulfilled') {
      setCode('');
      setAction(null);
      if (thunk === disableMfa) dispatch(addToast({ type: 'success', title: 'Two-step sign-in is off' }));
    } else setError(res.payload?.message);
  };
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">Two-step sign-in</h2>
        {data.mfa.enrolled ? <Pill tone="green"><Icon name="shield" className="h-3.5 w-3.5" /> On</Pill> : <Pill tone="red">Off</Pill>}
      </div>
      <p className="mt-2 text-sm text-grey-600">
        {data.mfa.enrolled
          ? `On since ${when(data.mfa.enrolledAt)}. ${data.mfa.recoveryCodesLeft} recovery code${data.mfa.recoveryCodesLeft === 1 ? '' : 's'} left.`
          : 'Signing in will also ask for a code from an authenticator app on your phone, so a stolen password is not enough.'}
        {data.mfa.required && ' Your roles require it, so it cannot be turned off.'}
      </p>
      {!data.mfa.enrolled && !setup && <Button className="mt-4" onClick={() => dispatch(startMfaSetup())}>Set up an authenticator app</Button>}
      {!data.mfa.enrolled && setup && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(confirmMfaSetup);
          }}
        >
          <img src={setup.qr} alt="QR code for your authenticator app" width="180" height="180" className="rounded-2xl bg-white p-2 ring-1 ring-grey-800/10" />
          <p className="mt-2 break-all text-xs text-grey-600">Setup key: <span className="font-mono">{setup.secret}</span></p>
          <div className="mt-3"><CodeField value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={error} id="setup-code" /></div>
          <div className="mt-3 flex gap-2">
            <Button type="submit" loading={busy} disabled={code.length !== 6}>Turn it on</Button>
            <Button type="button" variant="quiet" onClick={() => dispatch(setupCancelled())}>Cancel</Button>
          </div>
        </form>
      )}
      {data.mfa.enrolled && !action && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAction('codes')}>New recovery codes</Button>
          {!data.mfa.required && <Button variant="ghost" size="sm" onClick={() => setAction('off')}>Turn off</Button>}
        </div>
      )}
      {data.mfa.enrolled && action && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(action === 'codes' ? regenerateRecoveryCodes : disableMfa);
          }}
        >
          <CodeField label="A current code from your app" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={error} id="confirm-code" />
          <div className="mt-3 flex gap-2">
            <Button type="submit" variant={action === 'off' ? 'danger' : 'primary'} loading={busy} disabled={code.length !== 6}>{action === 'codes' ? 'Make new codes' : 'Turn off two-step sign-in'}</Button>
            <Button type="button" variant="quiet" onClick={() => (setAction(null), setError(null))}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function PasswordSection({ hasPassword, email }) {
  const dispatch = useDispatch();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!hasPassword) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-extrabold">Password</h2>
        <p className="mt-2 text-sm text-grey-600">You sign in with Google. To add a password as well, use “Forgot password” on any sign-in page with {email}.</p>
      </Card>
    );
  }
  return (
    <Card className="p-6">
      <h2 className="text-xl font-extrabold">Change password</h2>
      <p className="mt-1 text-sm text-grey-600">Every other device will be signed out.</p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (next !== confirm) return setError('The new passwords do not match');
          setBusy(true);
          const res = await dispatch(changePassword({ current, next }));
          setBusy(false);
          if (changePassword.fulfilled.match(res)) {
            setCurrent('');
            setNext('');
            setConfirm('');
            dispatch(addToast({ type: 'success', title: 'Password changed', message: 'Other devices were signed out.' }));
            dispatch(loadSecurity());
          } else setError(res.payload?.message);
        }}
      >
        <PasswordField label="Current password" id="pw-current" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="New password" id="pw-next" strength personEmail={email} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <PasswordField label="Confirm the new password" id="pw-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p className="rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text" role="alert">{error}</p>}
        <Button type="submit" loading={busy} disabled={!current || passwordProblems(next, { email }).length > 0}>Change password</Button>
      </form>
    </Card>
  );
}

function Sessions({ data }) {
  const dispatch = useDispatch();
  const [confirmAll, setConfirmAll] = useState(false);
  return (
    <Card className="p-6">
      <h2 className="text-xl font-extrabold">Where you are signed in</h2>
      <ul className="mt-4 grid gap-2">
        {data.sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 p-3 text-sm ring-1 ring-grey-800/10">
            <span>
              <span className="flex flex-wrap items-center gap-2 font-bold">
                {deviceName(s.device)} {s.current && <Pill tone="green">This device</Pill>}
                <Pill>{s.app === 'admin' ? 'Admin console' : `${ROLE_LABEL[s.portal]} portal`}</Pill>
              </span>
              <span className="mt-0.5 block text-grey-600">Signed in {when(s.startedAt)} · last active {when(s.lastUsedAt)}</span>
            </span>
            {!s.current && (
              <Button variant="quiet" size="sm" onClick={() => dispatch(endSession({ id: s.id }))}>Sign out</Button>
            )}
          </li>
        ))}
      </ul>
      {confirmAll ? (
        <div className="mt-4 rounded-2xl bg-red/10 p-3 text-sm">
          <p className="font-semibold text-red-text">Sign out every device, including this one?</p>
          <div className="mt-2 flex gap-2">
            <Button variant="danger" size="sm" onClick={() => dispatch(logoutEverywhere())}>Sign out everywhere</Button>
            <Button variant="quiet" size="sm" onClick={() => setConfirmAll(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setConfirmAll(true)}><Icon name="logout" className="h-4 w-4" /> Sign out everywhere</Button>
      )}
    </Card>
  );
}

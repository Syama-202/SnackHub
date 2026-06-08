import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import AuthShell from '../../components/auth/Shell';
import { PasswordField, Select, Check, fieldErrors } from '../../components/auth/Fields';
import { Button, Icon, Input } from '../../components/ui';
import { registerAccount, resendVerification } from '../../store/slices/auth';
import { COUNTRY_CODES, PORTALS, signInPath } from '../../constants/auth';
import { passwordProblems, PASSWORD_MAX } from '@shared/domain/passwords';

// What each portal calls the fields; the rest of the business or rider details come in onboarding
const COPY = {
  customer: { name: 'Full name', email: 'Email', title: 'Create your account', sub: 'Order hometown snacks from verified shops near you.', after: 'Then sign in and order.' },
  seller: { name: "Owner's full legal name", email: 'Business email', title: 'Register your snack business', sub: 'Create the account first. Next you add the shop details and licences, and we verify them before you go live.', after: 'Then sign in, set up two-step sign-in and add your shop details.' },
  rider: { name: 'Full legal name, as on your ID', email: 'Email', title: 'Become a delivery partner', sub: 'Create the account first. Next you add your vehicle and documents, and we check them before your first delivery.', after: 'Then sign in and add your vehicle and documents.' },
};

const schemaFor = () =>
  z
    .object({
      name: z.string().trim().min(2, 'Enter your full name').max(120).regex(/^[\p{L}][\p{L} .'-]*$/u, 'Use letters, spaces, dots and hyphens only'),
      email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
      countryCode: z.string(),
      mobile: z.string().trim().regex(/^\d{0,14}$/, 'Digits only, without the country code').optional(),
      password: z.string().max(PASSWORD_MAX),
      confirm: z.string(),
      acceptTerms: z.literal(true, { error: 'Accept the terms and privacy policy to continue' }),
    })
    .superRefine((v, ctx) => {
      const problems = passwordProblems(v.password, { email: v.email, name: v.name });
      if (problems.length) ctx.addIssue({ code: 'custom', path: ['password'], message: problems[0] });
      if (v.password !== v.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'The passwords do not match' });
      if (v.mobile && v.mobile.length < 6) ctx.addIssue({ code: 'custom', path: ['mobile'], message: 'This number looks too short' });
    });

export default function SignUp({ portal }) {
  const dispatch = useDispatch();
  const [sentTo, setSentTo] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [resent, setResent] = useState(false);
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schemaFor()),
    defaultValues: { countryCode: '+91', mobile: '', acceptTerms: false },
  });
  if (!PORTALS[portal]) return <Navigate to="/join" replace />;
  const copy = COPY[portal];
  const p = PORTALS[portal];

  const onSubmit = async ({ confirm: _c, mobile, countryCode, ...v }) => {
    setServerError(null);
    const res = await dispatch(registerAccount({ portal, ...v, ...(mobile ? { mobile, countryCode } : {}) }));
    if (registerAccount.fulfilled.match(res)) return setSentTo(v.email);
    const err = res.payload;
    const byField = fieldErrors(err);
    if (err?.code === 'WEAK_PASSWORD' || err?.code === 'PASSWORD_BREACHED') setError('password', { message: err.message });
    for (const [f, m] of Object.entries(byField)) setError(f, { message: m });
    if (!Object.keys(byField).length && err?.code !== 'WEAK_PASSWORD' && err?.code !== 'PASSWORD_BREACHED') setServerError(err?.message ?? 'Something went wrong');
  };

  if (sentTo) {
    return (
      <AuthShell portal={portal} title="Check your inbox" sub={`If ${sentTo} can be used, we have sent a link to confirm it. The link works once and expires in 24 hours.`}>
        <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4 text-sm ring-1 ring-grey-800/10">
          <Icon name="mail" className="mt-0.5 h-5 w-5 shrink-0 text-orange-text" />
          <p>{copy.after} Already have an account with this email? The email explains how to sign in instead.</p>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button variant="ghost" disabled={resent} onClick={async () => (await dispatch(resendVerification({ email: sentTo })), setResent(true))}>
            {resent ? 'Sent again' : 'Send the link again'}
          </Button>
          <Link to={signInPath(portal)} className="inline-flex h-12 items-center justify-center rounded-full bg-primary font-bold text-grey-800 shadow-cta">Go to sign in</Link>
        </div>
        <p className="mt-4 text-xs text-grey-600">Running SnackHub locally? Emails are saved as files in backend/storage/mail; open the newest one.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      portal={portal}
      title={copy.title}
      sub={copy.sub}
      footer={
        <>
          Already registered? <Link to={signInPath(portal)} className="font-bold text-orange-text">Sign in to the {p.label.toLowerCase()} portal</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        {serverError && <p className="rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text" role="alert">{serverError}</p>}
        <Input label={copy.name} autoComplete="name" {...register('name')} error={errors.name?.message} />
        <Input label={copy.email} type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
        <div className="grid grid-cols-[8.5rem_1fr] gap-2">
          <Select label="Country" {...register('countryCode')}>
            {COUNTRY_CODES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Input label="Mobile (optional)" inputMode="numeric" autoComplete="tel-national" placeholder="9876543210" {...register('mobile')} error={errors.mobile?.message} hint="Verified later by text message, when available" />
        </div>
        <PasswordField label="Password" autoComplete="new-password" strength personEmail={watch('email')} personName={watch('name')} value={watch('password') ?? ''} {...register('password')} error={errors.password?.message} />
        <PasswordField label="Confirm password" id="confirm" autoComplete="new-password" {...register('confirm')} error={errors.confirm?.message} />
        <Check
          id="acceptTerms"
          {...register('acceptTerms')}
          error={errors.acceptTerms?.message}
          label={
            <>
              I accept the SnackHub{' '}
              <Link to="/terms" target="_blank" className="font-bold text-orange-text hover:underline">terms of use</Link> and{' '}
              <Link to="/privacy" target="_blank" className="font-bold text-orange-text hover:underline">privacy policy</Link> (demo). We use your details only to run your account{portal !== 'customer' ? ' and to verify you' : ''}.
            </>
          }
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

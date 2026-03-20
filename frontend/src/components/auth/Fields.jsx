import { forwardRef, useState } from 'react';
import { Icon, cx } from '../ui';
import { passwordProblems, PASSWORD_MIN } from '@shared/domain/passwords';

const inputClass = (error) =>
  cx('h-11 w-full rounded-xl border bg-white px-3.5 text-[0.9375rem] text-grey-800 placeholder:text-grey-400 transition focus:border-orange focus:outline-none focus:ring-4 focus:ring-orange/15', error ? 'border-red' : 'border-grey-800/15');

const Message = ({ id, error, hint }) =>
  error ? <span id={`${id}-err`} className="mt-1 block text-sm font-semibold text-red-text" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="mt-1 block text-sm text-grey-600">{hint}</span> : null;

/**
 * A password with a show/hide button. strength shows the live checklist (sign-up and reset);
 * personEmail and personName let it warn when the password contains them.
 */
export const PasswordField = forwardRef(function PasswordField({ label = 'Password', id, error, hint, strength, personEmail, personName, value, autoComplete = 'current-password', ...rest }, ref) {
  const [shown, setShown] = useState(false);
  const fid = id || rest.name;
  const problems = strength ? passwordProblems(value ?? '', { email: personEmail, name: personName }) : [];
  return (
    <label className="block" htmlFor={fid}>
      <span className="mb-1.5 block text-sm font-bold text-grey-800">{label}</span>
      <span className="relative block">
        <input ref={ref} id={fid} type={shown ? 'text' : 'password'} autoComplete={autoComplete} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `${fid}-err` : `${fid}-hint`} className={cx(inputClass(error), 'pr-12')} {...rest} />
        <button type="button" onClick={() => setShown((s) => !s)} className="absolute right-1 top-1/2 grid h-9 w-10 -translate-y-1/2 place-items-center rounded-lg text-grey-600 hover:bg-grey-50" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
          <Icon name={shown ? 'eyeOff' : 'eye'} className="h-5 w-5" />
        </button>
      </span>
      {strength ? (
        <span id={`${fid}-hint`} className="mt-1.5 block text-sm">
          {error ? (
            <span className="font-semibold text-red-text" role="alert">{error}</span>
          ) : value && problems.length === 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Icon name="check" className="h-4 w-4" /> Strong enough</span>
          ) : (
            <span className="text-grey-600">{value ? problems[0] : `At least ${PASSWORD_MIN} characters. A short sentence you will remember works well.`}</span>
          )}
        </span>
      ) : (
        <Message id={fid} error={error} hint={hint} />
      )}
    </label>
  );
});

/** A 6-digit authenticator code, or a recovery code when allowRecovery. */
export const CodeField = forwardRef(function CodeField({ label = '6-digit code', id = 'mfa-code', error, recovery = false, ...rest }, ref) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-sm font-bold text-grey-800">{recovery ? 'Recovery code' : label}</span>
      <input
        ref={ref}
        id={id}
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        maxLength={recovery ? 9 : 6}
        placeholder={recovery ? 'abcd-efgh' : '123456'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cx(inputClass(error), 'text-center font-display text-2xl tracking-[0.4em]')}
        {...rest}
      />
      <Message id={id} error={error} />
    </label>
  );
});

/** A select styled like Input. */
export const Select = forwardRef(function Select({ label, id, error, hint, children, className, ...rest }, ref) {
  const fid = id || rest.name;
  return (
    <label className={cx('block', className)} htmlFor={fid}>
      {label && <span className="mb-1.5 block text-sm font-bold text-grey-800">{label}</span>}
      <select ref={ref} id={fid} aria-invalid={Boolean(error)} className={cx(inputClass(error), 'pr-8')} {...rest}>
        {children}
      </select>
      <Message id={fid} error={error} hint={hint} />
    </label>
  );
});

/** A tick box with its label, and an error under it. */
export const Check = forwardRef(function Check({ id, label, error, ...rest }, ref) {
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm">
        <input ref={ref} id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange-deep" aria-invalid={Boolean(error)} {...rest} />
        <span>{label}</span>
      </label>
      {error && <span className="mt-1 block text-sm font-semibold text-red-text" role="alert">{error}</span>}
    </div>
  );
});

/** The server's field errors ({ field, message }[]) as a map, for the forms. */
export const fieldErrors = (err) => Object.fromEntries((Array.isArray(err?.details) ? err.details : []).map((d) => [d.field, d.message]));

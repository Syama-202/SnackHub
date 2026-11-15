import { Fragment, forwardRef, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { rupees } from '@shared/domain/money';
import { useReveal } from '../../hooks';

const cx = (...c) => c.filter(Boolean).join(' ');

// ---------- Button: primary gradient with grey-800 text, danger with white text (doc 22.1)
// One main action per screen is primary; secondary sits beside it; ghost and quiet are for
// actions on a coloured or busy background; danger confirms a destructive action and
// dangerOutline offers one.
const BTN = {
  primary: 'bg-primary text-grey-800 shadow-cta hover:shadow-lg hover:brightness-[1.03] disabled:shadow-none shine',
  secondary: 'bg-white text-grey-800 border border-grey-800/15 shadow-sm hover:border-grey-800/30 hover:bg-grey-50',
  danger: 'bg-danger text-white hover:brightness-105 shine',
  dangerOutline: 'border border-red/45 bg-white text-red-text hover:bg-red/5 hover:border-red',
  dark: 'bg-grey-800 text-white hover:bg-grey-900',
  ghost: 'bg-white/70 text-grey-800 border border-white/80 shadow-sm backdrop-blur hover:bg-white',
  quiet: 'text-grey-800 hover:bg-grey-800/5',
  outline: 'border-2 border-orange text-orange-text bg-white/80 hover:bg-orange/10',
};
// md matches the 44 px inputs; nothing goes below the 44 px touch target except sm
const SIZE = { sm: 'h-9 px-4 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-12 px-7 text-base' };

export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', className, loading, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-full font-semibold transition-[transform,box-shadow,background-color,border-color,filter,opacity] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        BTN[variant],
        SIZE[size],
        size === 'sm' && 'min-h-9',
        className,
      )}
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

const ICON_BTN = {
  quiet: 'text-grey-600 hover:bg-grey-800/5 hover:text-grey-800',
  solid: 'bg-white text-grey-800 border border-grey-800/10 shadow-sm hover:border-grey-800/25',
  danger: 'text-red-text hover:bg-red/10',
};
/** A round button that shows only an icon. The label is read out and shows as a tooltip. */
export const IconButton = forwardRef(function IconButton({ label, icon, variant = 'quiet', size = 'md', className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cx('grid shrink-0 place-items-center rounded-full transition-[transform,background-color,border-color,color] duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'h-9 w-9' : 'h-11 w-11', ICON_BTN[variant], className)}
      {...rest}
    >
      {icon ? <Icon name={icon} className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} /> : children}
    </button>
  );
});

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, glass, children, as: As = 'div', ...rest }) {
  return (
    <As className={cx(glass ? 'glass' : 'surface', className)} {...rest}>
      {children}
    </As>
  );
}

const PILL = {
  sun: 'bg-sun text-grey-800',
  orange: 'bg-orange/15 text-orange-text',
  red: 'bg-red/10 text-red-text',
  grey: 'bg-grey-50 text-grey-600',
  green: 'bg-emerald-50 text-emerald-700',
  dark: 'bg-grey-800 text-white',
};
export function Pill({ tone = 'grey', className, children, ...rest }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', PILL[tone], className)} {...rest}>
      {children}
    </span>
  );
}

// ---------- Form fields: Input, Select and Textarea share one look (the `field` utility in
// styles/index.css), one label style and one message line. An error shows an icon as well as
// red text, so it does not rely on colour alone.
export function FieldLabel({ children, optional }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-grey-800">
      <span>{children}</span>
      {optional && <span className="text-xs font-semibold text-grey-600">Optional</span>}
    </span>
  );
}

export function FieldMessage({ id, error, hint }) {
  if (error)
    return (
      <span id={`${id}-err`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-red-text">
        <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </span>
    );
  return hint ? <span id={`${id}-hint`} className="mt-1.5 block text-sm text-grey-600">{hint}</span> : null;
}

const describedBy = (id, error, hint) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export const Input = forwardRef(function Input({ label, hint, error, optional, className, id, ...rest }, ref) {
  const fid = id || rest.name;
  return (
    <label className={cx('block', className)} htmlFor={fid}>
      {label && <FieldLabel optional={optional}>{label}</FieldLabel>}
      <input ref={ref} id={fid} aria-invalid={Boolean(error)} aria-describedby={describedBy(fid, error, hint)} className="field h-11" {...rest} />
      <FieldMessage id={fid} error={error} hint={hint} />
    </label>
  );
});

/** A select styled like Input, with its own arrow so it looks the same in every browser. */
export const Select = forwardRef(function Select({ label, hint, error, optional, className, id, children, ...rest }, ref) {
  const fid = id || rest.name;
  return (
    <label className={cx('block', className)} htmlFor={fid}>
      {label && <FieldLabel optional={optional}>{label}</FieldLabel>}
      <span className="relative block">
        <select ref={ref} id={fid} aria-invalid={Boolean(error)} aria-describedby={describedBy(fid, error, hint)} className="field h-11 appearance-none pr-10" {...rest}>
          {children}
        </select>
        <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grey-600" />
      </span>
      <FieldMessage id={fid} error={error} hint={hint} />
    </label>
  );
});

/** A text area styled like Input. With maxLength it shows how many characters are left. */
export const Textarea = forwardRef(function Textarea({ label, hint, error, optional, className, id, rows = 3, ...rest }, ref) {
  const fid = id || rest.name;
  const left = rest.maxLength && typeof rest.value === 'string' ? rest.maxLength - rest.value.length : null;
  return (
    <label className={cx('block', className)} htmlFor={fid}>
      {label && <FieldLabel optional={optional}>{label}</FieldLabel>}
      <textarea ref={ref} id={fid} rows={rows} aria-invalid={Boolean(error)} aria-describedby={describedBy(fid, error, hint)} className="field resize-y py-2.5 leading-relaxed" {...rest} />
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0"><FieldMessage id={fid} error={error} hint={hint} /></span>
        {left !== null && left <= 40 && <span className={cx('nums mt-1.5 shrink-0 text-xs font-semibold', left <= 10 ? 'text-red-text' : 'text-grey-600')} aria-live="polite">{left} left</span>}
      </span>
    </label>
  );
});

function useFocusTrap(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const el = ref.current;
    const focusables = () => el?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [];
    setTimeout(() => (focusables()[0] || el)?.focus(), 30);
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab') {
        const f = [...focusables()];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const ov = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = ov;
      prev?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, onClose, title, children, className, wide }) {
  const ref = useFocusTrap(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-grey-900/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
          <m.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cx('relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg', className)}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* on a phone the dialog is a bottom sheet: the bar shows it can be closed */}
            <span className="sticky top-0 z-10 mx-auto block h-1.5 w-10 translate-y-2 rounded-full bg-grey-800/15 sm:hidden" aria-hidden="true" />
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, side = 'right' }) {
  const ref = useFocusTrap(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div className="fixed inset-0 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-grey-900/40" onClick={onClose} aria-hidden="true" />
          <m.aside
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cx('absolute top-0 flex h-full w-full max-w-md flex-col bg-[#FFFBF5] shadow-2xl', side === 'right' ? 'right-0' : 'left-0')}
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
          >
            {children}
          </m.aside>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function CloseButton({ onClick, label = 'Close', className }) {
  return (
    <button onClick={onClick} aria-label={label} className={cx('grid h-11 w-11 place-items-center rounded-full text-grey-600 transition hover:bg-grey-800/5 hover:text-grey-800', className)}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
    </button>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />;
}

export function Price({ paise, mrp, className }) {
  return (
    <span className={cx('nums inline-flex items-baseline gap-1.5', className)}>
      <span className="font-bold text-grey-800">{rupees(paise)}</span>
      {mrp ? (
        <>
          <s className="text-xs text-grey-600">{rupees(mrp)}</s>
          <span className="text-xs font-semibold text-red-text">{Math.round((1 - paise / mrp) * 100)}% off</span>
        </>
      ) : null}
    </span>
  );
}

export function SpiceMeter({ level = 0 }) {
  if (!level) return null;
  return (
    <span role="img" className="inline-flex items-center gap-0.5" aria-label={`Spice level ${level} of 3`} title={`Spice ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <svg key={i} viewBox="0 0 12 16" className={cx('h-3.5 w-2.5', i <= level ? 'text-red' : 'text-grey-400/50')} aria-hidden="true">
          <path d="M6 3c3 0 5 3 4 7-1 3-3 5-5 5-1 0-1-1 0-2 2-1 2-3 1-5S4 4 6 3z M6 3c0-1 1-2 2-2" fill="currentColor" stroke="currentColor" strokeWidth=".8" />
        </svg>
      ))}
    </span>
  );
}

export function TempBadge({ temp }) {
  return temp === 'HOT' ? (
    <Pill tone="red" title="Served hot: 3 km range, 12 minute ride cap">
      <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true"><path d="M8 1c1 3 4 4 4 8a4 4 0 1 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7z" fill="currentColor" /></svg>
      Hot
    </Pill>
  ) : (
    <Pill tone="orange" title="Sweet or dry: 5 km range, 20 minute ride cap">Travels well</Pill>
  );
}

/** ADD turns into a compact quantity selector (master prompt 6). */
export function QtyControl({ qty, onChange, max = 99, disabled, size = 'md', label = 'item' }) {
  const h = size === 'sm' ? 'h-9' : 'h-10';
  if (!qty)
    return (
      <button
        onClick={() => onChange(1)}
        disabled={disabled}
        className={cx(h, 'shine min-w-[88px] rounded-xl bg-primary px-4 text-sm font-bold tracking-wide text-grey-900 shadow-cta transition hover:shadow-lg active:scale-95 disabled:bg-none disabled:bg-grey-50 disabled:text-grey-400 disabled:shadow-none')}
        aria-label={disabled ? `Sold out, ${label}` : `Add ${label}`}
      >
        {disabled ? 'SOLD OUT' : 'ADD'}
      </button>
    );
  return (
    <div className={cx(h, 'inline-flex min-w-[84px] items-center justify-between rounded-xl bg-primary px-1 text-grey-800')} role="group" aria-label={`Quantity of ${label}`}>
      <button className="grid h-8 w-8 place-items-center rounded-lg text-lg font-bold hover:bg-white/30" onClick={() => onChange(qty - 1)} aria-label={`Remove one ${label}`}>−</button>
      <span className="min-w-6 text-center text-sm font-bold" aria-live="polite">{qty}</span>
      <button className="grid h-8 w-8 place-items-center rounded-lg text-lg font-bold hover:bg-white/30 disabled:opacity-40" onClick={() => onChange(qty + 1)} disabled={qty >= max} aria-label={`Add one more ${label}`}>+</button>
    </div>
  );
}

/**
 * The round SnackHub logo with the text wordmark beside it. The artwork has its own lettering,
 * but it cannot be read below about 48 px, so small places (navbar, footer, console headers)
 * keep the text; compact shows the circle alone.
 */
export function Logo({ className = '', compact = false, tone = 'dark' }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <LogoMark className="h-11 w-11 shadow-[0_6px_18px_-6px_rgba(232,106,0,0.6)]" />
      {!compact && (
        <span className="font-display text-[1.4375rem] font-bold leading-none tracking-[-0.035em]">
          <span className="text-gradient">Snack</span>
          <span className={tone === 'dark' ? 'text-grey-800' : 'text-white'}>Hub</span>
        </span>
      )}
    </span>
  );
}

/** The round brand logo (public/assets/brand/logo-round.webp). Decorative: the wordmark or a label names it. */
export function LogoMark({ className }) {
  return <img src="/assets/brand/logo-round.webp" alt="" width="512" height="512" decoding="async" className={cx('shrink-0 rounded-full object-contain', className)} />;
}

/**
 * Nothing to show yet: what is missing, why, and the next step. `icon` names one from Icon
 * (a round badge is drawn around it); `art` replaces the badge with your own picture.
 * compact fits inside a card or a drawer.
 */
export function EmptyState({ title, body, action, art, icon = 'box', compact = false, className }) {
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'px-4 py-6' : 'px-6 py-12 sm:py-16', className)}>
      {art ?? (
        <span className={cx('grid place-items-center rounded-full bg-sun-soft text-orange-ink ring-8 ring-sun-soft/50', compact ? 'h-12 w-12' : 'h-16 w-16')} aria-hidden="true">
          <Icon name={icon} className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
        </span>
      )}
      <h2 className={cx('font-bold text-grey-800', compact ? 'mt-3 text-base' : 'mt-5 text-xl')}>{title}</h2>
      {body && <p className={cx('mt-1.5 max-w-sm text-grey-600', compact && 'text-sm')}>{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * Something failed to load: a plain reason and a way to try again. Use it in place of the
 * content that could not be shown; a failed action (a save, a payment) uses a toast instead.
 */
export function ErrorState({ title = 'Could not load this', body = 'Check your connection and try again.', onRetry, retrying, action, compact = false, className }) {
  return (
    <div role="alert" className={cx('flex flex-col items-center text-center', compact ? 'px-4 py-6' : 'px-6 py-12 sm:py-16', className)}>
      <span className={cx('grid place-items-center rounded-full bg-red/10 text-red-text ring-8 ring-red/5', compact ? 'h-12 w-12' : 'h-16 w-16')} aria-hidden="true">
        <Icon name="alert" className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
      </span>
      <h2 className={cx('font-bold text-grey-800', compact ? 'mt-3 text-base' : 'mt-5 text-xl')}>{title}</h2>
      {body && <p className={cx('mt-1.5 max-w-sm text-grey-600', compact && 'text-sm')}>{body}</p>}
      {(onRetry || action) && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry && <Button variant="secondary" onClick={onRetry} loading={retrying}><Icon name="refresh" className="h-4 w-4" /> Try again</Button>}
          {action}
        </div>
      )}
    </div>
  );
}

/** A message inside a page or form: info, success, warning or error, with an icon as well as colour. */
const NOTE = {
  info: ['bg-grey-50 text-grey-800', 'info'],
  success: ['bg-emerald-50 text-emerald-800', 'check'],
  warning: ['bg-sun-soft text-orange-ink', 'alert'],
  error: ['bg-red/10 text-red-text', 'alert'],
};
export function Note({ tone = 'info', title, children, className, ...rest }) {
  const [look, icon] = NOTE[tone] ?? NOTE.info;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2.5 rounded-2xl p-3.5 text-sm', look, className)} {...rest}>
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cx(tone === 'error' && !title && 'font-semibold')}>{children}</div>
      </div>
    </div>
  );
}

/** The title block of an inner page: where you are, a line of help, and the page's actions. */
export function PageHeader({ title, sub, eyebrow, actions, className }) {
  return (
    <header className={cx('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-grey-600">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * A headline whose words rise one after another when it scrolls into view (doc 22.3).
 * Screen readers get the plain sentence; the animated words are hidden from them.
 */
export function SplitWords({ text, as: Tag = 'span', className, delay = 0 }) {
  const ref = useReveal();
  if (typeof text !== 'string') return <Tag className={className}>{text}</Tag>;
  return (
    <Tag ref={ref} className={cx('split-words', className)}>
      <span className="sr-only">{text}</span>
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span aria-hidden="true">
            <span style={{ '--i': i, '--d': `${delay}ms` }}>{w}</span>
          </span>
        </Fragment>
      ))}
    </Tag>
  );
}

export function SectionTitle({ eyebrow, title, sub, className, align = 'left' }) {
  return (
    <div className={cx(align === 'center' && 'mx-auto text-center', 'max-w-2xl', className)}>
      {eyebrow && <p className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-orange-text"><span className="h-px w-8 bg-orange-text/60" aria-hidden="true" />{eyebrow}</p>}
      <SplitWords as="h2" text={title} className="text-[clamp(1.75rem,1.2rem+2vw,2.5rem)] font-bold leading-[1.1] text-grey-800" />
      {sub && <p className="mt-3 text-lg text-grey-600">{sub}</p>}
    </div>
  );
}

export function Icon({ name, className = 'h-5 w-5' }) {
  const p = ICONS[name];
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}

const ICONS = {
  cart: <><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  pin: <><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  heart: <path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z" />,
  check: <path d="m5 12 5 5 9-10" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9m-4 4 3 3m-6-1 2 2" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8.5v.5" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15.5" /><path d="M20 20v-4.5h-4.5" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  store: <><path d="M4 9 5.5 4h13L20 9" /><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" /><path d="M5 12v8h14v-8" /><path d="M10 20v-5h4v5" /></>,
  play: <path d="M7 5v14l11-7z" />,
  pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  box: <><path d="M3 7 12 3l9 4-9 4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>,
  scooter: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17h7l3-7h3M10 10h4" /></>,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4m0 3v.5" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M16 13h2M3 10h18" /></>,
  flag: <path d="M5 21V4h11l-1.5 4L16 12H5" />,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  sparkle: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6" />,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14m6-12v14" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
  twitter: <path d="M4 4l16 16M20 4 4 20" />,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3z" /></>,
};

export { cx };

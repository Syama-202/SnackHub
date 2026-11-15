import { Link } from 'react-router-dom';
import { Card, Icon, LogoMark, cx } from '../ui';
import { PORTALS } from '../../constants/auth';

/**
 * The frame every sign-up, sign-in and recovery page shares: the round logo, which portal
 * this is (so nobody signs in to the wrong one), the heading and the form.
 */
export default function AuthShell({ portal, title, sub, children, footer, wide = false }) {
  const p = portal ? PORTALS[portal] : null;
  return (
    <div className={cx('page grid min-h-[70vh] place-items-center py-10', wide ? 'max-w-3xl' : 'max-w-lg')}>
      <Card glass className="w-full p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <LogoMark className="h-14 w-14 shadow-[0_10px_26px_-10px_rgba(232,106,0,0.7)]" />
          {p && (
            <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-3 py-1 text-xs font-bold uppercase tracking-wider text-grey-900', p.tone)}>
              <Icon name={p.icon} className="h-3.5 w-3.5" /> {p.label} portal
            </span>
          )}
        </div>
        <h1 className="mt-5 page-title">{title}</h1>
        {sub && <p className="mt-2 text-grey-600">{sub}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-grey-800/10 pt-4 text-sm text-grey-600">{footer}</div>}
      </Card>
      <p className="mt-4 text-center text-xs text-grey-600">
        <Link to="/" className="font-semibold text-orange-text">Back home</Link>
      </p>
    </div>
  );
}

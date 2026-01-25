import { Link } from 'react-router-dom';
import { Logo, Icon } from '../components/ui';
import { PROMISE_WORDING } from '../domain/promise';

const COLS = [
  { title: 'Regional collections', links: [['Andhra Pradesh', '/shop?region=Andhra Pradesh'], ['Tamil Nadu', '/shop?region=Tamil Nadu'], ['Karnataka', '/shop?region=Karnataka'], ['Maharashtra', '/shop?region=Maharashtra'], ['West Bengal', '/shop?region=West Bengal']] },
  { title: 'Snack categories', links: [['Spicy snacks', '/shop?cat=spicy'], ['Traditional sweets', '/shop?cat=sweets'], ['Savoury mixtures', '/shop?cat=mixtures'], ['Tea-time snacks', '/shop?cat=tea-time'], ['Festive treats', '/shop?cat=festive']] },
  { title: 'SnackHub', links: [['How delivery works', '/#delivery'], ['Every shop is checked', '/#checked'], ['Sell on SnackHub', '/seller'], ['Ride with SnackHub', '/rider'], ['Design system', '/design']] },
];

/** Warm dark footer, cream text, restrained yellow and orange (master prompt 14). */
export default function Footer() {
  return (
    <footer className="mt-24 bg-grey-900 text-[#FFF3E0]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div>
          <Logo tone="light" />
          <p className="mt-4 max-w-xs text-[#FFF3E0]/80">India's regional flavours from verified local shops near you.</p>
          <p className="mt-3 max-w-xs text-sm text-[#FFF3E0]/60">{PROMISE_WORDING}</p>
          <div className="mt-5 flex gap-2">
            {['instagram', 'youtube', 'twitter'].map((n) => (
              <a key={n} href="#" onClick={(e) => e.preventDefault()} aria-label={`SnackHub on ${n} (placeholder)`} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 transition hover:bg-sun hover:text-grey-800">
                <Icon name={n} className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h3 className="font-display text-lg font-bold text-sun">{c.title}</h3>
            <ul className="mt-3 space-y-2">
              {c.links.map(([label, to]) => (
                <li key={label}>
                  <Link to={to} className="text-[#FFF3E0]/80 transition hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-[#FFF3E0]/60 md:flex-row">
          <p className="font-display text-xl font-bold text-[#FFF3E0]">Made for cravings. Inspired by India.</p>
          <p>
            hello@snackhub.example · Guntur, Andhra Pradesh (placeholder) · <span className="underline-offset-2">Privacy</span> · <span>Terms</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

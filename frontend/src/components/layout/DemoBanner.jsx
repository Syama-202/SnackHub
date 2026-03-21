import { useState } from 'react';
import { apiFetch, getAccessToken } from '../../services/api';

/** "Show a Demo data banner in the app" (doc 23). */
export default function DemoBanner({ tone = 'light' }) {
  const [busy, setBusy] = useState(false);
  // a real account's orders, payments on delivery and GPS are real; only the seeded demo shops are not
  const real = Boolean(getAccessToken()) && !getAccessToken().startsWith('demo.');
  const reset = async () => {
    setBusy(true);
    await apiFetch('/dev/reset', { method: 'POST' }).catch(() => {});
    window.location.reload();
  };
  return (
    <div className={tone === 'light' ? 'bg-grey-800 text-white' : 'bg-grey-900 text-white'}>
      <div className="page flex items-center justify-center gap-x-3 py-1.5 text-center text-[0.8125rem]">
        <span className="shrink-0 rounded-full bg-sun px-2 py-px text-[0.6875rem] font-extrabold uppercase tracking-wide text-grey-800">Demo data</span>
        {/* one line on phones, the full note from tablet width up */}
        <span className="truncate opacity-90 sm:hidden">{real ? 'Shops marked demo are fictional.' : 'Nothing here is real.'}</span>
        <span className="hidden opacity-90 sm:inline">
          {real ? 'Shops marked demo, their riders and prices are fictional and take no real orders. Snack pictures are illustrations.' : 'Shops, riders, prices and times are fictional. Snack pictures are illustrations. Payments and tracking are simulated.'}
        </span>
        {!real && (
          <button onClick={reset} disabled={busy} className="shrink-0 font-bold text-sun underline-offset-2 hover:underline">
            {busy ? 'Resetting…' : 'Reset demo'}
          </button>
        )}
      </div>
    </div>
  );
}

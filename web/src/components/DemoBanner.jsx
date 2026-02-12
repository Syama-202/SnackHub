import { useState } from 'react';
import { apiFetch } from '../lib/api';

/** "Show a Demo data banner in the app" (doc 23). */
export default function DemoBanner({ tone = 'light' }) {
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    await apiFetch('/dev/reset', { method: 'POST' }).catch(() => {});
    window.location.reload();
  };
  return (
    <div className={tone === 'light' ? 'bg-grey-800 text-white' : 'bg-grey-900 text-white'}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-[13px]">
        <span className="rounded-full bg-sun px-2 py-px text-[11px] font-extrabold uppercase tracking-wide text-grey-800">Demo data</span>
        <span className="opacity-90">Shops, riders, prices and times are fictional. Snack pictures are illustrations. Payments and tracking are simulated.</span>
        <button onClick={reset} disabled={busy} className="font-bold text-sun underline-offset-2 hover:underline">
          {busy ? 'Resetting…' : 'Reset demo'}
        </button>
      </div>
    </div>
  );
}

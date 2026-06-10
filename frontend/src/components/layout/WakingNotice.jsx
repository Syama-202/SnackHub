import { useEffect, useState } from 'react';
import { isWaking, onWaking } from '../../services/api';
import { Spinner } from '../ui';

/**
 * While reads wait for the sleeping free API host to wake (services/api.jsx), a small note
 * says so, instead of a page that looks stuck or empty. Screen readers hear it once.
 */
export default function WakingNotice() {
  const [waking, setWaking] = useState(isWaking);
  useEffect(() => onWaking(setWaking), []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      {waking && (
        <p className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-grey-900 px-4 py-3 text-sm text-white shadow-xl">
          <Spinner className="h-5 w-5 shrink-0 text-sun" />
          <span>
            <b className="block">Waking up the server…</b>
            The free plan sleeps when nobody has visited for a while. This can take up to a minute.
          </span>
        </p>
      )}
    </div>
  );
}

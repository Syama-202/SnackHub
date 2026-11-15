import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { isActive, STATE_LABEL } from '@shared/domain/orderStates';
import { useTracking, useStageToasts } from '../../hooks/useTracking';
import { Icon, cx } from '../ui';

/** Text for the aria-live line, e.g. "Rider is 12 minutes away". */
export function laneStatus(t) {
  if (!t) return '';
  if (t.stage === 'ON_THE_WAY' || t.stage === 'PICKED_UP') return `Rider is ${t.etaMin} minute${t.etaMin === 1 ? '' : 's'} away · ${(t.distanceM / 1000).toFixed(1)} km`;
  if (t.stage === 'ARRIVED') return 'Your rider has reached your door';
  if (t.stage === 'DELIVERED') return 'Delivered. Enjoy!';
  return STATE_LABEL[t.stage];
}

/**
 * Fixed strip at the bottom of every customer page while an order is active (doc 22.5): the
 * rider's distance and ETA from their last GPS position, and a link to the live map.
 */
export default function RiderLane() {
  // The order list is kept fresh by CustomerLayout
  const { pathname } = useLocation();
  const active = useSelector((state) => state.orders.list.find((o) => isActive(o.status)));
  const [lingering, setLingering] = useState(null);
  const id = active?.id || lingering;
  const onOwnPage = pathname === `/orders/${id}`;
  // The tracking page polls the same order itself, so the lane only reads it there
  const { track } = useTracking(id, { enabled: Boolean(id) && !onOwnPage });
  useStageToasts(track);
  const show = Boolean(track) && !onOwnPage && !['CANCELLED', 'REJECTED'].includes(track.stage);

  // Keep the lane a few seconds after delivery for the hand-over moment, then close
  useEffect(() => {
    if (active) setLingering(active.id);
    else if (lingering && track?.stage === 'DELIVERED') {
      const t = setTimeout(() => setLingering(null), 6000);
      return () => clearTimeout(t);
    } else if (lingering && !active && track && track.stage !== 'DELIVERED') setLingering(null);
  }, [active, lingering, track]);

  useEffect(() => {
    document.documentElement.style.setProperty('--lane-h', show ? '64px' : '0px');
    return () => document.documentElement.style.setProperty('--lane-h', '0px');
  }, [show]);

  if (!show) return null;
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 bg-grey-900 shadow-lane">
      <div className="page flex h-16 items-center gap-3 text-white">
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sun opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sun" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" aria-live="polite">{laneStatus(track)}</p>
        {track.order.otpRevealed && track.stage !== 'DELIVERED' && <span className="hidden items-center gap-1 rounded-full bg-sun px-2 py-0.5 text-xs font-bold text-grey-800 sm:inline-flex"><Icon name="unlock" className="h-3.5 w-3.5" /> Code ready</span>}
        <Link to={`/orders/${id}`} className={cx('inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-sm font-bold text-grey-800')}>
          Track <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

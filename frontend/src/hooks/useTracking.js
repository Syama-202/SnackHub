import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTracking } from '../store/slices/order';
import { addToast } from '../store/slices/toast';
import { usePolling } from './index';

/**
 * Live tracking for one order, kept in the orders slice. Stands in for the
 * socket events order:update and rider:location: the mock server computes
 * stage, progress, distance and ETA, so every client agrees (doc 10.4).
 */
export function useTracking(orderId, { enabled = true } = {}) {
  const dispatch = useDispatch();
  const id = orderId == null ? null : String(orderId);
  usePolling(() => dispatch(fetchTracking(id)), 1500, Boolean(id) && enabled);
  const track = useSelector((state) => (id ? state.orders.tracking[id] : null));
  const error = useSelector((state) => (id ? state.orders.trackingErrors[id] : null));
  return { track, error, isLoading: Boolean(id) && !track && !error };
}

const STAGE_TOASTS = {
  ACCEPTED: { title: 'The shop accepted your order', type: 'info' },
  PACKED: { title: 'Your snacks are packed', type: 'info' },
  ON_THE_WAY: { title: 'Your rider is on the way', type: 'info' },
  ARRIVED: { title: 'Your rider has reached', message: 'Share your delivery code at the door.', type: 'sun' },
  DELIVERED: { title: 'Delivered. Enjoy!', type: 'success' },
  CANCELLED: { title: 'Order cancelled', type: 'error' },
  REJECTED: { title: 'The shop could not take your order', message: 'You were not charged.', type: 'error' },
};

/** Toasts on stage changes and when the code unlocks (never containing the code). */
export function useStageToasts(track) {
  const dispatch = useDispatch();
  const last = useRef({});
  useEffect(() => {
    if (!track) return;
    const id = track.order.id;
    const prev = last.current[id];
    if (prev && prev.stage !== track.stage && STAGE_TOASTS[track.stage]) dispatch(addToast(STAGE_TOASTS[track.stage]));
    if (prev && !prev.otp && track.order.otpRevealed) dispatch(addToast({ title: 'Your rider is nearby', message: 'Your delivery code is now available.', type: 'sun' }));
    last.current[id] = { stage: track.stage, otp: track.order.otpRevealed };
  }, [track, dispatch]);
}

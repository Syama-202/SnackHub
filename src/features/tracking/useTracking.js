import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { api } from '../../lib/api';
import { actions } from '../../store/webStore';
import { useDocumentVisible } from '../../lib/hooks';

/**
 * Stand-in for the socket events order:update and rider:location. The mock
 * server computes stage, progress, distance and ETA, so every client agrees.
 * In Phase 3 the same shape arrives from Socket.io instead of polling.
 */
export function useTracking(orderId, { enabled = true } = {}) {
  const visible = useDocumentVisible();
  return useQuery({
    queryKey: ['track', orderId],
    queryFn: () => api(`/orders/${orderId}/track`),
    enabled: Boolean(orderId) && enabled,
    refetchInterval: visible ? 1500 : 6000,
  });
}

const STAGE_TOASTS = {
  ACCEPTED: { title: 'The shop accepted your order', tone: 'info' },
  PACKED: { title: 'Your snacks are packed', tone: 'info' },
  ON_THE_WAY: { title: 'Your rider is on the way', tone: 'info' },
  ARRIVED: { title: 'Your rider has reached', body: 'Share your delivery code at the door.', tone: 'sun' },
  DELIVERED: { title: 'Delivered. Enjoy!', tone: 'success' },
  CANCELLED: { title: 'Order cancelled', tone: 'error' },
  REJECTED: { title: 'The shop could not take your order', body: 'You were not charged.', tone: 'error' },
};

/** Toasts on stage changes and when the code unlocks (never containing the code). */
export function useStageToasts(track) {
  const dispatch = useDispatch();
  const last = useRef({});
  useEffect(() => {
    if (!track) return;
    const id = track.order.id;
    const prev = last.current[id];
    if (prev && prev.stage !== track.stage && STAGE_TOASTS[track.stage]) dispatch(actions.toast(STAGE_TOASTS[track.stage]));
    if (prev && !prev.otp && track.order.otpRevealed) dispatch(actions.toast({ title: 'Your rider is nearby', body: 'Your delivery code is now available.', tone: 'sun' }));
    last.current[id] = { stage: track.stage, otp: track.order.otpRevealed };
  }, [track, dispatch]);
}

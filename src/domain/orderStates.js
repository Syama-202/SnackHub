/** Order lifecycle (doc 10.1, 10.9). One owner per transition. */
export const STATES = [
  'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED', 'CANCELLED', 'REJECTED',
];

const T = {
  PENDING_PAYMENT: { PLACED: ['system'], CANCELLED: ['system', 'customer'] },
  PLACED: { ACCEPTED: ['seller'], REJECTED: ['seller'], CANCELLED: ['customer', 'system', 'admin'] },
  ACCEPTED: { PACKING: ['system', 'seller'], CANCELLED: ['customer', 'admin'], REJECTED: ['seller'] },
  PACKING: { PACKED: ['seller'], CANCELLED: ['customer', 'admin'] },
  PACKED: { PICKED_UP: ['rider'], CANCELLED: ['admin'] },
  PICKED_UP: { ON_THE_WAY: ['system'] },
  ON_THE_WAY: { ARRIVED: ['system'] },
  ARRIVED: { DELIVERED: ['rider'] },
};

/** The one function every endpoint and consumer uses (State pattern). */
export function canTransition(from, to, role) {
  return Boolean(T[from]?.[to]?.includes(role));
}

export const ACTIVE_STATES = ['PLACED', 'ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'];
export const isActive = (s) => ACTIVE_STATES.includes(s);
export const customerCanCancel = (s) => ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PACKING'].includes(s);

export const STATE_LABEL = {
  PENDING_PAYMENT: 'Waiting for payment',
  PLACED: 'Waiting for the shop',
  ACCEPTED: 'Shop accepted',
  PACKING: 'Packing your snacks',
  PACKED: 'Packed, rider collecting',
  PICKED_UP: 'Picked up',
  ON_THE_WAY: 'On the way',
  ARRIVED: 'Rider has reached',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected by shop',
};

export const TIMELINE = ['PLACED', 'ACCEPTED', 'PACKING', 'PACKED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED'];

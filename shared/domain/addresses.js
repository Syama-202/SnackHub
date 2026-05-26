/**
 * Delivery address rules shared by the API and the app (doc 11.1): the kinds of place, their
 * names, and the length of every field. Instructions are for the rider, so they hold no codes
 * or payment details; the app says so next to the box.
 */
export const ADDRESS_KINDS = ['HOME', 'HOSTEL', 'COLLEGE', 'OFFICE', 'OTHER'];

export const KIND_LABEL = { HOME: 'Home', HOSTEL: 'Hostel', COLLEGE: 'College', OFFICE: 'Office', OTHER: 'Other' };

export const ADDRESS_LIMITS = { label: [2, 30], line: [8, 255], house: [1, 80], floor: [1, 20], landmark: [2, 120], instructions: [2, 200] };

/** One line for a rider and for the order's copy: flat, floor, street and area, landmark, pincode. */
export function addressSummary(a) {
  const floor = a.floor ? `floor ${a.floor}` : null;
  const pin = a.pincode && !String(a.line ?? '').includes(a.pincode) ? a.pincode : null;
  return [a.house, floor, a.line, a.landmark ? `near ${a.landmark}` : null, pin].filter(Boolean).join(', ');
}

/**
 * What a seller or rider must fill in before their application can be submitted. Drafts may
 * be half done; submission needs every field below plus the required documents
 * (documents.js). The forms show the same list, so the checklist and the API agree.
 */
import { MOTOR_MODES } from './documents.js';

export const MIN_RIDER_AGE = 18;

export const PROFILE_FIELDS = {
  seller: {
    ownerLegalName: "Owner's legal name",
    businessType: 'Business type',
    businessEmail: 'Business email',
    businessPhone: 'Business phone',
    shopName: 'Shop name',
    kind: 'What you sell from',
    addressLine: 'Business address',
    state: 'State',
    city: 'City',
    pin: 'PIN code',
    lat: 'Pickup location',
    radiusKm: 'Delivery radius',
    openHours: 'Opening hours',
    bankHolder: 'Account holder name',
    bankIfsc: 'IFSC',
    bankAccountLast4: 'Bank account number',
  },
  rider: {
    legalName: 'Full legal name',
    dob: 'Date of birth',
    addressLine: 'Home address',
    state: 'State',
    city: 'City',
    pin: 'PIN code',
    emergencyName: 'Emergency contact name',
    emergencyPhone: 'Emergency contact phone',
    backgroundConsentAt: 'Consent to the background check',
    mode: 'How you deliver',
  },
};

/** Whole years between a date of birth and now. */
export function ageOn(dob, now = Date.now()) {
  const d = new Date(`${String(dob).slice(0, 10)}T00:00:00Z`);
  const n = new Date(now);
  let age = n.getUTCFullYear() - d.getUTCFullYear();
  const m = n.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && n.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

/**
 * The missing or invalid profile answers: [{ field, label }]. profile is the business (sellers)
 * or the rider profile; vehicle is the rider's vehicle.
 */
export function profileGaps(kind, profile = {}, vehicle = null, now = Date.now()) {
  const p = { ...(profile || {}), ...(kind === 'rider' ? { mode: vehicle?.mode ?? null } : {}) };
  const gaps = Object.entries(PROFILE_FIELDS[kind])
    .filter(([field]) => p[field] === null || p[field] === undefined || p[field] === '')
    .map(([field, label]) => ({ field, label }));
  if (kind === 'rider') {
    if (p.dob && ageOn(p.dob, now) < MIN_RIDER_AGE) gaps.push({ field: 'dob', label: `Riders must be at least ${MIN_RIDER_AGE}` });
    if (vehicle && MOTOR_MODES.includes(vehicle.mode) && !vehicle.registrationNo) gaps.push({ field: 'registrationNo', label: 'Vehicle registration number' });
  }
  return gaps;
}

export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const BANK_ACCOUNT = /^\d{9,18}$/;
export const PIN = /^[1-9]\d{5}$/;
export const OPEN_HOURS = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
export const VEHICLE_REG = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

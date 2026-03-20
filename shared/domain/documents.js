/**
 * Verification documents: what each one is, what we ask about it, and which ones a seller or
 * rider must upload. Ask only for what the check needs: a number when it is checked against
 * a register, dates when the document expires. Numbers are stored encrypted and shown masked.
 *
 * Which documents apply is data (catalog.document_requirements, dispatch.document_requirements),
 * so admins can change it per business type, delivery mode and state. DEFAULT_REQUIREMENTS
 * seeds those tables; requirementsFor() reads them the same way on the API and in the forms.
 */

export const BUSINESS_TYPES = ['individual', 'sole_proprietorship', 'partnership', 'company'];
export const BUSINESS_TYPE_LABELS = {
  individual: 'Individual or home cook',
  sole_proprietorship: 'Sole proprietorship',
  partnership: 'Partnership or LLP',
  company: 'Private or public company',
};
// bicycle riders never need motor-vehicle documents
export const DELIVERY_MODES = ['motorcycle', 'scooter', 'ev_scooter', 'bicycle'];
export const DELIVERY_MODE_LABELS = { motorcycle: 'Motorcycle', scooter: 'Petrol scooter', ev_scooter: 'Electric scooter', bicycle: 'Bicycle' };
export const MOTOR_MODES = ['motorcycle', 'scooter', 'ev_scooter'];

export const STATES = [
  'Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Goa', 'Gujarat', 'Delhi',
  'Uttar Pradesh', 'West Bengal', 'Odisha', 'Rajasthan', 'Punjab', 'Haryana', 'Madhya Pradesh', 'Bihar', 'Puducherry',
];

/**
 * number: { label, pattern, hint } when the document has a number we check; null when not.
 * issuer / issued / expires: whether we ask for them. A required expiry date must be in the future.
 */
export const DOC_TYPES = {
  // ---- sellers
  OWNER_ID: {
    roles: ['seller'],
    label: "Owner's government ID",
    help: 'Passport, voter ID, driving licence, or Aadhaar with only the last 4 digits visible (masked Aadhaar).',
    number: { label: 'ID number (last 4 digits for Aadhaar)', pattern: '^[A-Za-z0-9 -]{4,20}$', hint: 'Letters and numbers only' },
    issuer: true,
    issued: false,
    expires: false,
  },
  PAN: {
    roles: ['seller', 'rider'],
    label: 'PAN card',
    help: 'Permanent Account Number for tax on settlements and payouts.',
    number: { label: 'PAN', pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', hint: 'Like ABCDE1234F' },
    issuer: false,
    issued: false,
    expires: false,
  },
  FSSAI: {
    roles: ['seller'],
    label: 'FSSAI licence or registration',
    help: 'Every food business in India needs an FSSAI basic registration, state or central licence.',
    number: { label: 'FSSAI number', pattern: '^[0-9]{14}$', hint: '14 digits' },
    issuer: true,
    issued: true,
    expires: true,
  },
  GST: {
    roles: ['seller'],
    label: 'GST registration certificate',
    help: 'Needed once turnover crosses the GST threshold, and always for companies and partnerships.',
    number: { label: 'GSTIN', pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$', hint: '15 characters, like 37ABCDE1234F1Z5' },
    issuer: false,
    issued: true,
    expires: false,
  },
  BUSINESS_REG: {
    roles: ['seller'],
    label: 'Business registration',
    help: 'Certificate of incorporation, partnership deed or LLP agreement, or Shops and Establishments registration.',
    number: { label: 'Registration number (CIN, LLPIN or certificate number)', pattern: '^[A-Za-z0-9/ -]{4,30}$', hint: 'As printed on the certificate' },
    issuer: true,
    issued: true,
    expires: false,
  },
  BANK_PROOF: {
    roles: ['seller', 'rider'],
    label: 'Cancelled cheque or bank statement',
    help: 'Shows the account holder name and account number for settlements.',
    number: null,
    issuer: false,
    issued: false,
    expires: false,
  },
  ADDRESS_PROOF: {
    roles: ['seller'],
    label: 'Proof of business address',
    help: 'Electricity bill, rent agreement or property tax receipt for the pickup address.',
    number: null,
    issuer: false,
    issued: true,
    expires: false,
  },
  LOCAL_PERMIT: {
    roles: ['seller'],
    label: 'Trade licence or local food permit',
    help: 'A municipal trade licence or street-vending certificate, where your city requires one.',
    number: { label: 'Permit number', pattern: '^[A-Za-z0-9/ -]{4,30}$', hint: 'As printed' },
    issuer: true,
    issued: true,
    expires: true,
  },
  // ---- riders
  ID_PROOF: {
    roles: ['rider'],
    label: 'Government ID',
    help: 'Passport, voter ID, or Aadhaar with only the last 4 digits visible (masked Aadhaar).',
    number: { label: 'ID number (last 4 digits for Aadhaar)', pattern: '^[A-Za-z0-9 -]{4,20}$', hint: 'Letters and numbers only' },
    issuer: true,
    issued: false,
    expires: false,
  },
  PHOTO: {
    roles: ['rider'],
    label: 'Profile photo',
    help: 'A clear photo of your face. Customers see it so they know who is at the door.',
    number: null,
    issuer: false,
    issued: false,
    expires: false,
  },
  DRIVING_LICENCE: {
    roles: ['rider'],
    label: 'Driving licence',
    help: 'Must cover the class of vehicle you ride (MCWG for motorcycles and scooters).',
    number: { label: 'Licence number', pattern: '^[A-Z]{2}[0-9 -]{11,16}$', hint: 'Like AP07 20110012345' },
    issuer: true,
    issued: true,
    expires: true,
  },
  VEHICLE_RC: {
    roles: ['rider'],
    label: 'Vehicle registration certificate (RC)',
    help: 'The RC of the vehicle you will deliver on.',
    number: { label: 'Registration number', pattern: '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$', hint: 'Like AP07AB1234, no spaces' },
    issuer: true,
    issued: true,
    expires: true,
  },
  INSURANCE: {
    roles: ['rider'],
    label: 'Motor insurance',
    help: 'Third-party insurance is the legal minimum.',
    number: { label: 'Policy number', pattern: '^[A-Za-z0-9/ -]{6,30}$', hint: 'As printed on the policy' },
    issuer: true,
    issued: true,
    expires: true,
  },
  PUC: {
    roles: ['rider'],
    label: 'Pollution Under Control (PUC) certificate',
    help: 'Petrol vehicles only; electric scooters do not need one.',
    number: { label: 'Certificate number', pattern: '^[A-Za-z0-9/ -]{4,30}$', hint: 'As printed' },
    issuer: false,
    issued: true,
    expires: true,
  },
  OWNERSHIP_AUTH: {
    roles: ['rider'],
    label: "Owner's permission to use the vehicle",
    help: 'Only if the RC is not in your name: a signed letter from the owner.',
    number: null,
    issuer: false,
    issued: true,
    expires: false,
  },
};

export const docTypesFor = (role) => Object.keys(DOC_TYPES).filter((t) => DOC_TYPES[t].roles.includes(role));

/**
 * Default requirement rows. Several rows may name one document; the strictest row that
 * applies wins (required over optional). `types` is a list of business types (sellers) or
 * delivery modes (riders), null for all; `states` likewise. A document no row applies to is
 * not asked for.
 */
export const DEFAULT_REQUIREMENTS = {
  seller: [
    { docType: 'OWNER_ID', mode: 'required', types: null, states: null },
    { docType: 'PAN', mode: 'required', types: null, states: null },
    { docType: 'FSSAI', mode: 'required', types: null, states: null },
    { docType: 'GST', mode: 'required', types: ['partnership', 'company'], states: null },
    { docType: 'GST', mode: 'optional', types: ['individual', 'sole_proprietorship'], states: null },
    { docType: 'BUSINESS_REG', mode: 'required', types: ['partnership', 'company'], states: null },
    { docType: 'BUSINESS_REG', mode: 'optional', types: ['sole_proprietorship'], states: null },
    { docType: 'BANK_PROOF', mode: 'required', types: null, states: null },
    { docType: 'ADDRESS_PROOF', mode: 'optional', types: null, states: null },
    { docType: 'LOCAL_PERMIT', mode: 'optional', types: null, states: null },
  ],
  rider: [
    { docType: 'ID_PROOF', mode: 'required', types: null, states: null },
    { docType: 'PHOTO', mode: 'required', types: null, states: null },
    { docType: 'PAN', mode: 'optional', types: null, states: null },
    { docType: 'BANK_PROOF', mode: 'optional', types: null, states: null },
    { docType: 'DRIVING_LICENCE', mode: 'required', types: ['motorcycle', 'scooter', 'ev_scooter'], states: null },
    { docType: 'VEHICLE_RC', mode: 'required', types: ['motorcycle', 'scooter', 'ev_scooter'], states: null },
    { docType: 'INSURANCE', mode: 'required', types: ['motorcycle', 'scooter', 'ev_scooter'], states: null },
    { docType: 'PUC', mode: 'required', types: ['motorcycle', 'scooter'], states: null },
    { docType: 'OWNERSHIP_AUTH', mode: 'optional', types: ['motorcycle', 'scooter', 'ev_scooter'], states: null },
  ],
};

const RANK = { required: 2, optional: 1 };

/**
 * The documents an applicant is asked for: [{ docType, required }], in catalogue order.
 * ctx.type is the business type or delivery mode, ctx.state the state; either may be unknown
 * while a draft is half filled, and then only the rows that apply to everyone count.
 */
export function requirementsFor(role, rows, { type = null, state = null } = {}) {
  const best = new Map();
  for (const r of rows) {
    if (r.mode !== 'required' && r.mode !== 'optional') continue;
    if (!DOC_TYPES[r.docType]?.roles.includes(role)) continue;
    if (r.types && !(type && r.types.includes(type))) continue;
    if (r.states && !(state && r.states.includes(state))) continue;
    if ((RANK[r.mode] ?? 0) > (RANK[best.get(r.docType)] ?? 0)) best.set(r.docType, r.mode);
  }
  return docTypesFor(role)
    .filter((t) => best.has(t))
    .map((t) => ({ docType: t, required: best.get(t) === 'required' }));
}

// ---- document lifecycle

// PENDING: uploaded, waiting for a reviewer. SUPERSEDED: a newer version replaced it.
export const DOC_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED'];
// reminders go out this many days before a document expires
export const EXPIRY_WARN_DAYS = 30;
export const EXPIRY_REMIND_AT = [30, 7, 1];

const day = (d) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);
const today = (now) => day(new Date(now));

/** 'valid', 'expiring' (within EXPIRY_WARN_DAYS), 'expired', or 'no-expiry'. */
export function expiryState(expiresOn, now = Date.now()) {
  const e = day(expiresOn);
  if (!e) return 'no-expiry';
  const t = today(now);
  if (e < t) return 'expired';
  const warn = day(new Date(new Date(t).getTime() + EXPIRY_WARN_DAYS * 86_400_000));
  return e <= warn ? 'expiring' : 'valid';
}

/** Whole days from today until the expiry date (negative once it has passed). */
export const daysUntil = (expiresOn, now = Date.now()) => Math.round((new Date(day(expiresOn)) - new Date(today(now))) / 86_400_000);

/** The version that counts for each document type: the newest that is not superseded. */
export function currentDocuments(docs) {
  const byType = new Map();
  for (const d of docs) {
    if (d.status === 'SUPERSEDED') continue;
    const prev = byType.get(d.docType);
    if (!prev || d.version > prev.version) byType.set(d.docType, d);
  }
  return byType;
}

/** The approved, unexpired version of a type, which may be older than a pending renewal. */
export function validApproved(docs, docType, now = Date.now()) {
  return docs
    .filter((d) => d.docType === docType && d.status === 'APPROVED' && expiryState(d.expiresOn, now) !== 'expired')
    .sort((a, b) => b.version - a.version)[0] ?? null;
}

/**
 * Checks an applicant's document details before upload; returns field -> message.
 * Dates are YYYY-MM-DD strings.
 */
export function documentProblems(docType, { number, issuer, issuedOn, expiresOn }, now = Date.now()) {
  const t = DOC_TYPES[docType];
  if (!t) return { docType: 'Unknown document type' };
  const problems = {};
  if (t.number) {
    if (!number) problems.number = `${t.number.label} is required`;
    else if (!new RegExp(t.number.pattern).test(number)) problems.number = t.number.hint;
  }
  if (t.issuer && !issuer?.trim()) problems.issuer = 'Who issued it?';
  if (t.issued && issuedOn && issuedOn > today(now)) problems.issuedOn = 'The issue date cannot be in the future';
  if (t.expires) {
    if (!expiresOn) problems.expiresOn = 'Enter the expiry date';
    else if (expiresOn < today(now)) problems.expiresOn = 'This document has already expired';
    else if (issuedOn && expiresOn <= issuedOn) problems.expiresOn = 'The expiry date must be after the issue date';
  }
  return problems;
}

/** "••••1234": how a document number is shown to reviewers and in the app; never the full value. */
export const maskNumber = (last4) => (last4 ? `••••${last4}` : null);

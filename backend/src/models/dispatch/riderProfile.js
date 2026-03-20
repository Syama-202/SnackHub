// dispatch.rider_profiles: who the rider is, as they fill it in during onboarding. Every
// column may be empty in a draft; submission checks it is complete. Date of birth is asked
// only to check the minimum age; the bank account number is stored encrypted.
const TABLE = 'rider_profiles';

const COLUMNS = {
  legalName: 'legal_name',
  dob: 'dob',
  addressLine: 'address_line',
  state: 'state',
  city: 'city',
  pin: 'pin',
  emergencyName: 'emergency_name',
  emergencyPhone: 'emergency_phone',
  backgroundConsentAt: 'background_consent_at',
  bankHolder: 'bank_holder',
  bankIfsc: 'bank_ifsc',
  bankAccountEnc: 'bank_account_enc',
  bankAccountLast4: 'bank_account_last4',
};

const day = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const view = (r) => r && Object.fromEntries(Object.entries(COLUMNS).map(([k, c]) => [k, c === 'dob' ? day(r[c]) : r[c]]));

export const riderProfileModel = {
  find: (db, userId) => db(TABLE).where({ user_id: userId }).first().then(view),
  save: (db, userId, fields) => {
    const row = Object.fromEntries(Object.entries(fields).filter(([k]) => COLUMNS[k]).map(([k, v]) => [COLUMNS[k], v]));
    return db(TABLE).insert({ user_id: userId, ...row }).onConflict('user_id').merge(Object.keys(row).length ? Object.keys(row) : ['user_id']);
  },
};

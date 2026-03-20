// catalog.seller_businesses: the business behind a shop, as the applicant fills it in. Every
// column may be empty while the application is a draft; submission checks it is complete.
// The bank account number is stored encrypted, with its last four digits for display.
const TABLE = 'seller_businesses';

const COLUMNS = {
  ownerLegalName: 'owner_legal_name',
  businessType: 'business_type',
  businessEmail: 'business_email',
  businessPhone: 'business_phone',
  shopName: 'shop_name',
  kind: 'kind',
  addressLine: 'address_line',
  state: 'state',
  city: 'city',
  pin: 'pin',
  lat: 'lat',
  lng: 'lng',
  radiusKm: 'radius_km',
  openHours: 'open_hours',
  bankHolder: 'bank_holder',
  bankIfsc: 'bank_ifsc',
  bankAccountEnc: 'bank_account_enc',
  bankAccountLast4: 'bank_account_last4',
};

const view = (r) => r && Object.fromEntries(Object.entries(COLUMNS).map(([k, c]) => [k, c === 'lat' || c === 'lng' || c === 'radius_km' ? (r[c] == null ? null : Number(r[c])) : r[c]]));

export const sellerBusinessModel = {
  find: (db, userId) => db(TABLE).where({ user_id: userId }).first().then(view),
  /** Saves the given fields (camelCase); others stay as they were. */
  save: (db, userId, fields) => {
    const row = Object.fromEntries(Object.entries(fields).filter(([k]) => COLUMNS[k]).map(([k, v]) => [COLUMNS[k], v]));
    return db(TABLE).insert({ user_id: userId, ...row }).onConflict('user_id').merge(Object.keys(row).length ? Object.keys(row) : ['user_id']);
  },
};

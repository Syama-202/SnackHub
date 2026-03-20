// identity.users: one account per email. Roles are memberships in identity.user_roles; the
// password lives in identity.credentials. A mobile number counts only once verified, and a
// verified number belongs to one account (uq_verified_mobile).
const TABLE = 'users';
const PUBLIC = ['id', 'email', 'name', 'status', 'status_reason', 'email_verified_at', 'mobile', 'mobile_verified_at', 'created_at'];

export const userModel = {
  findById: (db, id) => db(TABLE).select(PUBLIC).where({ id }).first(),
  findByEmail: (db, email) => db(TABLE).select(PUBLIC).where({ email: String(email).toLowerCase() }).first(),
  /** Only a verified mobile signs anyone in. */
  findByVerifiedMobile: (db, mobile) => db(TABLE).select(PUBLIC).where({ verified_mobile: mobile }).first(),
  findByGoogleSub: (db, sub) => db(TABLE).select(PUBLIC).where({ google_sub: sub }).first(),
  /** The Google subject linked to an account, or null; used only by sign-in. */
  googleSubOf: (db, id) => db(TABLE).where({ id }).first('google_sub').then((r) => r?.google_sub ?? null),
  create: (db, { email, name, googleSub = null, mobile = null, emailVerified = false, termsVersion = null }) =>
    db(TABLE)
      .insert({
        email: String(email).toLowerCase(),
        name,
        google_sub: googleSub,
        mobile,
        email_verified_at: emailVerified ? new Date() : null,
        terms_version: termsVersion,
        terms_accepted_at: termsVersion ? new Date() : null,
      })
      .then(([id]) => id),
  /** Links Google to an account that has none yet; false if it already has one. */
  linkGoogle: (db, id, sub) => db(TABLE).where({ id }).whereNull('google_sub').update({ google_sub: sub }).then((n) => n === 1),
  /** Marks the email verified, but only if it is still the address the link was sent to. */
  markEmailVerified: (db, id, email) => db(TABLE).where({ id, email: String(email).toLowerCase() }).update({ email_verified_at: db.raw('COALESCE(email_verified_at, ?)', [new Date()]) }).then((n) => n === 1),
  /** A new number replaces the old one and is unverified until its code comes back. */
  setMobile: (db, id, mobile) => db(TABLE).where({ id }).update({ mobile, mobile_verified_at: null }),
  markMobileVerified: (db, id, mobile) => db(TABLE).where({ id, mobile }).update({ mobile_verified_at: new Date() }).then((n) => n === 1),
  setName: (db, id, name) => db(TABLE).where({ id }).update({ name }),
  /** 'active', or 'suspended' with the reason an admin gave. */
  setStatus: (db, id, status, reason = null) => db(TABLE).where({ id }).update({ status, status_reason: status === 'active' ? null : reason }),
  /** Accounts for the admin list: one page, newest first, filtered by role, status or text. */
  list: (db, { role, status, q, page = 1, pageSize = 25 }) => {
    const base = db(TABLE)
      .modify((x) => status && x.where(`${TABLE}.status`, status))
      .modify((x) => role && x.whereExists(db('user_roles').whereRaw('user_roles.user_id = users.id').where({ role })))
      .modify((x) => q && x.where((w) => w.where('email', 'like', `%${q}%`).orWhere('name', 'like', `%${q}%`)));
    return Promise.all([
      base.clone().count('* as n').first().then((r) => Number(r.n)),
      base.clone().select(PUBLIC.map((c) => `${TABLE}.${c}`)).orderBy('id', 'desc').limit(pageSize).offset((page - 1) * pageSize),
    ]).then(([total, items]) => ({ total, items }));
  },
};

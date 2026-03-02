// identity.users: one account per email; role and status decide what a person may do.
const TABLE = 'users';
const PUBLIC = ['id', 'email', 'name', 'role', 'status', 'created_at'];

export const userModel = {
  findById: (db, id) => db(TABLE).select(PUBLIC).where({ id }).first(),
  findByEmail: (db, email) => db(TABLE).select(PUBLIC).where({ email }).first(),
  findByGoogleSub: (db, sub) => db(TABLE).select(PUBLIC).where({ google_sub: sub }).first(),
  /** The Google subject linked to an account, or null; used only by sign-in. */
  googleSubOf: (db, id) => db(TABLE).where({ id }).first('google_sub').then((r) => r?.google_sub ?? null),
  create: (db, { email, name, role = 'customer', googleSub = null }) => db(TABLE).insert({ email, name, role, google_sub: googleSub }).then(([id]) => id),
  /** Links Google to an account that has none yet; false if it already has one. */
  linkGoogle: (db, id, sub) => db(TABLE).where({ id }).whereNull('google_sub').update({ google_sub: sub }).then((n) => n === 1),
  setRole: (db, id, role) => db(TABLE).where({ id }).update({ role }),
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
};

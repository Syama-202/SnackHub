// identity.users: one account per email; role and status decide what a person may do.
const TABLE = 'users';
const PUBLIC = ['id', 'email', 'name', 'role', 'status', 'created_at'];

export const userModel = {
  findById: (db, id) => db(TABLE).select(PUBLIC).where({ id }).first(),
  findByEmail: (db, email) => db(TABLE).select(PUBLIC).where({ email }).first(),
  findByGoogleSub: (db, sub) => db(TABLE).select(PUBLIC).where({ google_sub: sub }).first(),
  create: (db, { email, name, role = 'customer', googleSub = null }) => db(TABLE).insert({ email, name, role, google_sub: googleSub }).then(([id]) => id),
  setRole: (db, id, role) => db(TABLE).where({ id }).update({ role }),
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
};

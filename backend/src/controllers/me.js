// GET /me: the signed-in account, read fresh from the database, as seen through the token's portal.
import { userModel } from '../models/identity/user.js';
import { userRoleModel } from '../models/identity/userRole.js';
import { mfaTotpModel } from '../models/identity/mfaTotp.js';

export function meController({ dbs }) {
  async function show(req, res) {
    const db = dbs.identity;
    // requireRole has already checked that the account and the token's role are active
    const [user, roles, totp] = await Promise.all([userModel.findById(db, req.user.userId), userRoleModel.listForUser(db, req.user.userId), mfaTotpModel.find(db, req.user.userId)]);
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: req.user.role,
      roles: roles.filter((r) => r.status === 'active').map((r) => r.role),
      emailVerified: Boolean(user.email_verified_at),
      mobile: user.mobile,
      mobileVerified: Boolean(user.mobile_verified_at),
      mfaEnrolled: Boolean(totp),
    });
  }
  return { show };
}

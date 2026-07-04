// Your data, for the customer in the token only (DPDP Act):
//   GET  /me/export   a copy of everything held about the account, as a JSON download
//   POST /me/delete   erase the account; { confirm: "DELETE", password } (password only if
//                     the account has one; a Google-only account confirms with the word alone)
import { AppError } from '../utils/AppError.js';
import { userModel } from '../models/identity/user.js';
import { credentialModel } from '../models/identity/credential.js';
import { verifyPassword } from '../utils/passwords.js';
import { activeRoles, openOrderCount, exportAccount, eraseCustomerAccount } from '../utils/accounts.js';
import { REFRESH_COOKIE } from './auth.js';
import { deletionBlocker } from '../../../shared/domain/accounts.js';

export function accountController(deps) {
  const { env, dbs } = deps;

  async function exportData(req, res) {
    const data = await exportAccount(dbs, req.user.userId);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Disposition', 'attachment; filename="snackhub-my-data.json"');
    res.json(data);
  }

  async function remove(req, res) {
    const user = await userModel.findById(dbs.identity, req.user.userId);
    const cred = await credentialModel.find(dbs.identity, user.id);
    if (cred && !(req.body.password && (await verifyPassword(cred.password_hash, req.body.password)))) {
      throw new AppError(403, 'PASSWORD_WRONG', 'Enter your current password to delete your account');
    }
    const blocker = deletionBlocker({ roles: await activeRoles(dbs.identity, user.id), openOrders: await openOrderCount(dbs, user.id) });
    if (blocker) throw new AppError(409, blocker.code, blocker.message);
    await eraseCustomerAccount(deps, user);
    // every session was already revoked; this removes the cookie from this browser too
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict', path: '/api/v1/auth' });
    res.json({ deleted: true });
  }

  return { exportData, remove };
}

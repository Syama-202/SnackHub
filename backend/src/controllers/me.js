// GET /me: the signed-in account, read fresh from MySQL.
import { AppError } from '../utils/AppError.js';
import { userModel } from '../models/identity/user.js';

export function meController({ dbs }) {
  async function show(req, res) {
    const user = await userModel.findById(dbs.identity, req.user.userId);
    if (!user || user.status !== 'active') throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account is blocked. Contact support.');
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  }
  return { show };
}

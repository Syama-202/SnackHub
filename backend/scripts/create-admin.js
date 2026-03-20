// npm run create-admin -- --email you@example.com [--name "Your name"] [--role reviewer] [--reset-mfa]
// The only way a staff account comes to exist (doc 16.3): run on the server by its owner.
// Gives the account the admin role (or reviewer: the verification queue only) and prints a
// one-time enrolment link, valid for 15 minutes, to add the authenticator app. --reset-mfa
// removes a lost phone's secret and recovery codes, ends that person's sessions and issues a
// new link. Staff accounts cannot sign in on the public portals. Every run is audited.
import { parseArgs } from 'node:util';
import { loadEnv } from '../src/config/env.js';
import { moduleDb } from '../src/db/connection.js';
import { userModel } from '../src/models/identity/user.js';
import { auditLogModel } from '../src/models/identity/auditLog.js';
import { userRoleModel } from '../src/models/identity/userRole.js';
import { mfaTotpModel } from '../src/models/identity/mfaTotp.js';
import { recoveryCodeModel } from '../src/models/identity/recoveryCode.js';
import { refreshTokenModel } from '../src/models/identity/refreshToken.js';
import { issueEnrolmentLink } from '../src/controllers/adminAuth.js';

// Windows PowerShell drops the flags on their way through `npm run ... --`, leaving bare words,
// so `create-admin you@example.com "Your name"` works as well
const WORDS = ['reset-mfa', 'reviewer', 'admin'];
const { values, positionals } = parseArgs({ allowPositionals: true, options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' }, 'reset-mfa': { type: 'boolean', default: false } } });
values.email ??= positionals.find((p) => p.includes('@'));
values.name ??= positionals.filter((p) => !p.includes('@') && !WORDS.includes(p)).join(' ') || undefined;
values.role ??= positionals.includes('reviewer') ? 'reviewer' : 'admin';
values['reset-mfa'] ||= positionals.includes('reset-mfa');
const email = values.email?.trim().toLowerCase();
const role = values.role;
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !['admin', 'reviewer'].includes(role)) {
  console.error('Usage: npm run create-admin -- --email you@example.com [--name "Your name"] [--role admin|reviewer] [--reset-mfa]');
  process.exit(1);
}

const env = loadEnv();
const db = moduleDb(env, 'identity');
try {
  let user = await userModel.findByEmail(db, email);
  if (!user) {
    // the owner typed the address on the server, so it counts as verified
    const id = await userModel.create(db, { email, name: values.name || email.split('@')[0], emailVerified: true });
    user = await userModel.findById(db, id);
    await auditLogModel.append(db, { action: 'admin.created', target: `user:${id}`, after: { role, by: 'create-admin command' } });
    console.log(`Created ${role} ${email}.`);
  }
  if (await userRoleModel.add(db, { userId: user.id, role })) {
    // staff never keep a public-portal session
    await refreshTokenModel.revokeUser(db, user.id, 'web');
    await auditLogModel.append(db, { action: 'role.grant', target: `user:${user.id}`, after: { role, by: 'create-admin command' } });
    console.log(`${email} now has the ${role} role.`);
  } else {
    console.log(`${email} already has the ${role} role.`);
  }

  const enrolled = await mfaTotpModel.find(db, user.id);
  if (enrolled && !values['reset-mfa']) {
    console.log('Their authenticator app is already set up. Use --reset-mfa if the phone was lost.');
  } else {
    if (enrolled) {
      await db.transaction(async (trx) => {
        await mfaTotpModel.remove(trx, user.id);
        await recoveryCodeModel.removeAll(trx, user.id);
        await refreshTokenModel.revokeUser(trx, user.id, 'admin');
        await auditLogModel.append(trx, { action: 'admin.mfa.reset', target: `user:${user.id}`, after: { by: 'create-admin command' } });
      });
      console.log('Removed the old authenticator secret and recovery codes, and ended their admin sessions.');
    }
    const link = await issueEnrolmentLink(env, db, user.id);
    console.log('\nOpen this link within 15 minutes to add the authenticator app (it works once):\n');
    console.log(`  ${link}\n`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}

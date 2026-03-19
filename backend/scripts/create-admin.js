// npm run create-admin -- --email you@example.com [--name "Your name"] [--reset-mfa]
// The only way an admin account comes to exist (doc 16.3): run on the server by its owner.
// Makes (or keeps) the account an admin and prints a one-time enrolment link, valid for 15
// minutes, to add the authenticator app. --reset-mfa removes a lost phone's secret and
// recovery codes, ends that admin's sessions and issues a new link. Every run is audited.
import { parseArgs } from 'node:util';
import { loadEnv } from '../src/config/env.js';
import { moduleDb } from '../src/db/connection.js';
import { userModel } from '../src/models/identity/user.js';
import { auditLogModel } from '../src/models/identity/auditLog.js';
import { adminMfaModel } from '../src/models/identity/adminMfa.js';
import { adminRecoveryCodeModel } from '../src/models/identity/adminRecoveryCode.js';
import { refreshTokenModel } from '../src/models/identity/refreshToken.js';
import { issueEnrolmentLink } from '../src/controllers/adminAuth.js';

// Windows PowerShell drops the flags on their way through `npm run ... --`, leaving bare words,
// so `create-admin you@example.com "Your name"` works as well
const { values, positionals } = parseArgs({ allowPositionals: true, options: { email: { type: 'string' }, name: { type: 'string' }, 'reset-mfa': { type: 'boolean', default: false } } });
values.email ??= positionals.find((p) => p.includes('@'));
values.name ??= positionals.filter((p) => !p.includes('@') && p !== 'reset-mfa').join(' ') || undefined;
values['reset-mfa'] ||= positionals.includes('reset-mfa');
const email = values.email?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run create-admin -- --email you@example.com [--name "Your name"] [--reset-mfa]');
  process.exit(1);
}

const env = loadEnv();
const db = moduleDb(env, 'identity');
try {
  let user = await userModel.findByEmail(db, email);
  if (!user) {
    const id = await userModel.create(db, { email, name: values.name || email.split('@')[0], role: 'admin' });
    user = await userModel.findById(db, id);
    await auditLogModel.append(db, { action: 'admin.created', target: `user:${id}`, after: { role: 'admin', by: 'create-admin command' } });
    console.log(`Created admin ${email}.`);
  } else if (user.role !== 'admin') {
    await userModel.setRole(db, user.id, 'admin');
    // an admin never keeps a customer-site session
    await refreshTokenModel.revokeUser(db, user.id, 'web');
    await auditLogModel.append(db, { action: 'role.grant', target: `user:${user.id}`, before: { role: user.role }, after: { role: 'admin', by: 'create-admin command' } });
    console.log(`${email} is now an admin (was ${user.role}).`);
  } else {
    console.log(`${email} is already an admin.`);
  }

  const enrolled = await adminMfaModel.find(db, user.id);
  if (enrolled && !values['reset-mfa']) {
    console.log('Their authenticator app is already set up. Use --reset-mfa if the phone was lost.');
  } else {
    if (enrolled) {
      await db.transaction(async (trx) => {
        await adminMfaModel.remove(trx, user.id);
        await adminRecoveryCodeModel.removeAll(trx, user.id);
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

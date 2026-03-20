// identity.mfa_setups: a secret made for someone setting up an authenticator app, kept
// (encrypted) for 15 minutes until their first code proves the app has it. Only then does
// it move to mfa_totp; until then nothing about sign-in changes.
const TABLE = 'mfa_setups';

export const mfaSetupModel = {
  put: (db, userId, secretEnc, expiresAt) =>
    db(TABLE).insert({ user_id: userId, secret_enc: secretEnc, created_at: new Date(), expires_at: expiresAt }).onConflict('user_id').merge(),
  findLive: (db, userId) => db(TABLE).where({ user_id: userId }).andWhere('expires_at', '>', new Date()).first(),
  remove: (db, userId) => db(TABLE).where({ user_id: userId }).del(),
};

// Google ID token check (doc 16.1). verifyIdToken from google-auth-library checks the
// signature against Google's public keys, the audience (our client ID), the issuer and the
// expiry. Only the client ID is needed: no client secret exists anywhere in this code.
import { OAuth2Client } from 'google-auth-library';

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/** Returns verify(idToken) -> { sub, email, emailVerified, name }, or throws. */
export function createGoogleVerifier(clientId) {
  const client = new OAuth2Client();
  return async (idToken) => {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const p = ticket.getPayload();
    if (!p || !ISSUERS.includes(p.iss)) throw new Error('unexpected issuer');
    return { sub: p.sub, email: p.email?.toLowerCase() ?? null, emailVerified: p.email_verified === true, name: p.name || p.given_name || p.email };
  };
}

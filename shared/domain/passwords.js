/**
 * Password rules, shared so the forms and the API say the same thing (NIST SP 800-63B):
 * long rather than complicated, not a well-known password, not the person's own email or
 * name. Breached-password checks against a live list happen on the server when enabled.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

// the most common passwords in public breach lists, lower case; anything here is refused
const COMMON = new Set([
  '123456789', '1234567890', '12345678910', 'qwertyuiop', 'password1', 'password12', 'password123', 'password1234',
  'iloveyou123', '1q2w3e4r5t', 'qwerty1234', 'qwerty12345', 'abcdefghij', 'abc1234567', 'welcome123', 'admin12345',
  'letmein123', 'football123', 'monkey12345', 'sunshine123', 'princess123', 'india12345', 'india@123', 'iloveindia',
  'qwertyuiop1', 'asdfghjkl1', 'zxcvbnm123', '1111111111', '0000000000', '9876543210', 'passw0rd123', 'p@ssw0rd123',
  'changeme123', 'snackhub123', 'snackhub2026', 'password@123', 'pass@12345', 'test@12345', 'admin@1234', 'secret1234',
]);

/** Plain-language problems with a password; an empty list means it is acceptable. */
export function passwordProblems(password, { email = '', name = '' } = {}) {
  const pw = String(password ?? '');
  const lower = pw.toLowerCase();
  const problems = [];
  if (pw.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters`);
  if (pw.length > PASSWORD_MAX) problems.push(`Use at most ${PASSWORD_MAX} characters`);
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw)) problems.push('This password is too common; pick something less guessable');
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) problems.push('Do not use your email address in the password');
  const first = String(name).trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (first.length >= 4 && lower.includes(first)) problems.push('Do not use your name in the password');
  return problems;
}

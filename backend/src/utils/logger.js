// Structured JSON logs (doc 15.0). Secrets, tokens, delivery codes and addresses are
// redacted wherever they appear in a logged object.
import pino from 'pino';

export const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-razorpay-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.otp',
  '*.code',
  '*.otpHash',
  '*.address',
  '*.addressText',
  '*.line',
  '*.challenge',
  '*.recoveryCodes',
  '*.secret',
  '*.number',
  '*.bankAccount',
  '*.sealed',
];

export function createLogger(env) {
  return pino({ level: env.LOG_LEVEL, redact: { paths: REDACT, censor: '[redacted]' }, base: { service: 'snackhub-backend' } });
}

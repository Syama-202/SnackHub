// Text messages for mobile verification. SMS_PROVIDER decides:
//   ''        off: numbers are stored unverified and sign-in by mobile stays off
//   dev-mail  development only: the text is saved with the development emails (an .eml file
//             in backend/storage/mail), so the code can be read without an SMS account
//   twilio    Twilio's Messages API with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
export function createSms(env, mailer) {
  const provider = env.SMS_PROVIDER;
  if (!provider) return { enabled: false, send: async () => ({ skipped: true }) };
  if (provider === 'dev-mail') {
    if (env.NODE_ENV === 'production') throw new Error('SMS_PROVIDER=dev-mail is for development only');
    return {
      enabled: mailer.enabled,
      send: ({ to, body, messageId, name }) => mailer.send({ to: `sms-${to.replace(/\D/g, '')}@sms.snackhub.test`, subject: `SMS to ${to}`, text: body, messageId, name: `sms-${name ?? 'text'}` }),
    };
  }
  if (provider === 'twilio') {
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    return {
      enabled: true,
      send: async ({ to, body }) => {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`SMS provider answered ${res.status}`);
        return { sent: true };
      },
    };
  }
  throw new Error(`Unknown SMS_PROVIDER "${provider}"`);
}

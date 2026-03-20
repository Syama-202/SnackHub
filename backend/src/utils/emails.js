// The messages SnackHub sends: plain text first, with a small HTML version in the brand
// colours. Every value is escaped. Links carry a single-use token; nothing else that could
// sign someone in ever goes into an email.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ROLE_NAMES = { customer: 'customer', seller: 'seller', rider: 'delivery partner', reviewer: 'reviewer', admin: 'admin' };
const STATUS_WORDS = {
  APPROVED: 'approved',
  REJECTED: 'not approved',
  ACTION_REQUIRED: 'waiting for a few changes from you',
  SUSPENDED: 'suspended',
  UNDER_REVIEW: 'being reviewed',
};

function layout({ title, lines, button, footer }) {
  const text = [title, '', ...lines, ...(button ? ['', `${button.label}: ${button.href}`] : []), '', footer ?? 'SnackHub (demo). If this was not you, you can ignore this email.'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#FFFBF5;font-family:Arial,sans-serif;color:#1F2937">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font-size:22px;font-weight:800;margin:0 0 18px"><span style="color:#E86A00">Snack</span>Hub</p>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${lines.map((l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 10px">${esc(l)}</p>`).join('')}
${button ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="background:#FF7A00;color:#111827;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block">${esc(button.label)}</a></p><p style="font-size:12px;color:#4B5563;word-break:break-all">${esc(button.href)}</p>` : ''}
<p style="font-size:12px;color:#4B5563;margin-top:24px">${esc(footer ?? 'SnackHub (demo). If this was not you, you can ignore this email.')}</p>
</div></body></html>`;
  return { text, html };
}

const securityFooter = 'If you did not make this change, reset your password now and contact support. SnackHub (demo).';

export const TEMPLATES = {
  verify_email: (d) => ({ subject: 'Confirm your email for SnackHub', ...layout({ title: `Hi ${d.name}, confirm your email`, lines: ['Tap the button to confirm this address. The link works once and expires in 24 hours.'], button: { label: 'Confirm my email', href: d.link } }) }),
  account_exists: (d) => ({
    subject: 'You already have a SnackHub account',
    ...layout({
      title: `Hi ${d.name}, you already have an account`,
      lines: [`Someone tried to create a SnackHub ${ROLE_NAMES[d.portal]} account with this email. You already have one, so nothing new was made.`, d.portal === 'customer' ? 'Sign in with your password, or reset it if you have forgotten it.' : `To add a ${ROLE_NAMES[d.portal]} profile, sign in on that page with your existing password.`],
      button: { label: 'Sign in', href: d.link },
    }),
  }),
  password_reset: (d) => ({ subject: 'Reset your SnackHub password', ...layout({ title: `Hi ${d.name}, reset your password`, lines: ['Tap the button to choose a new password. The link works once and expires in 30 minutes.', 'Every device signed in to your account will be signed out.'], button: { label: 'Choose a new password', href: d.link } }) }),
  password_changed: (d) => ({ subject: 'Your SnackHub password was changed', ...layout({ title: `Hi ${d.name}, your password was changed`, lines: ['Your password was just changed and every other device was signed out.'], footer: securityFooter }) }),
  mfa_enabled: (d) => ({ subject: 'Two-step sign-in is on', ...layout({ title: `Hi ${d.name}, two-step sign-in is on`, lines: ['Signing in now also needs a code from your authenticator app. Keep your recovery codes somewhere safe.'], footer: securityFooter }) }),
  mfa_disabled: (d) => ({ subject: 'Two-step sign-in was turned off', ...layout({ title: `Hi ${d.name}, two-step sign-in is off`, lines: ['Your account no longer asks for an authenticator code.'], footer: securityFooter }) }),
  mfa_reset: (d) => ({ subject: 'Your authenticator was reset', ...layout({ title: `Hi ${d.name}, your authenticator was reset`, lines: ['The SnackHub team removed your authenticator app after checking your identity. Set it up again the next time you sign in.'], footer: securityFooter }) }),
  recovery_used: (d) => ({ subject: 'A recovery code was used', ...layout({ title: `Hi ${d.name}, a recovery code was used`, lines: [`Someone signed in with one of your recovery codes. ${d.left} ${d.left === 1 ? 'code is' : 'codes are'} left; you can make a new set on the security page.`], footer: securityFooter }) }),
  recovery_regenerated: (d) => ({ subject: 'New recovery codes', ...layout({ title: `Hi ${d.name}, you have new recovery codes`, lines: ['Your old recovery codes no longer work.'], footer: securityFooter }) }),
  sessions_revoked: (d) => ({ subject: 'You were signed out everywhere', ...layout({ title: `Hi ${d.name}, every device was signed out`, lines: ['All sessions on your account were ended. Sign in again on the devices you use.'], footer: securityFooter }) }),
  application_submitted: (d) => ({ subject: `We received your ${ROLE_NAMES[d.role]} application`, ...layout({ title: `Thanks, ${d.name}`, lines: [`Your ${ROLE_NAMES[d.role]} application is in the review queue. Most are checked within 48 hours; we will email you when it changes.`], button: { label: 'See your application', href: d.link } }) }),
  application_decision: (d) => ({
    subject: `Your ${ROLE_NAMES[d.role]} application is ${STATUS_WORDS[d.status] ?? d.status.toLowerCase()}`,
    ...layout({ title: `Hi ${d.name}, your application is ${STATUS_WORDS[d.status] ?? d.status.toLowerCase()}`, lines: [d.reason ? `Note from the verification team: ${d.reason}` : 'There is nothing more you need to do.'], button: { label: 'Open your application', href: d.link } }),
  }),
  document_rejected: (d) => ({ subject: `Please upload your ${d.docLabel} again`, ...layout({ title: `Hi ${d.name}, one document needs another look`, lines: [`${d.docLabel}: ${d.reason}`, 'Upload a corrected copy from your application page.'], button: { label: 'Fix it now', href: d.link } }) }),
  document_expiring: (d) => ({ subject: `${d.docLabel} expires in ${d.days} day${d.days === 1 ? '' : 's'}`, ...layout({ title: `Hi ${d.name}, a document expires soon`, lines: [`Your ${d.docLabel} expires on ${d.date}. Upload the renewed one before then to keep working without a break.`], button: { label: 'Upload the renewal', href: d.link } }) }),
  document_expired: (d) => ({ subject: `${d.docLabel} has expired`, ...layout({ title: `Hi ${d.name}, a document has expired`, lines: [`Your ${d.docLabel} expired on ${d.date}. Until the renewed one is approved you ${d.role === 'rider' ? 'cannot go online for deliveries' : 'are hidden from customers'}.`], button: { label: 'Upload the renewal', href: d.link } }) }),
  account_suspended: (d) => ({ subject: 'Your SnackHub account is suspended', ...layout({ title: `Hi ${d.name}, your account is suspended`, lines: [`Reason: ${d.reason}`, 'Reply to support if you think this is a mistake.'] }) }),
  account_reactivated: (d) => ({ subject: 'Your SnackHub account is active again', ...layout({ title: `Hi ${d.name}, welcome back`, lines: ['Your account is active again. You can sign in as before.'] }) }),
  mobile_code: (d) => ({ subject: 'SnackHub code', text: `${d.code} is your SnackHub code. It expires in 10 minutes. Never share it.`, html: null }),
};

export function render(template, data) {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`Unknown email template ${template}`);
  return t(data);
}

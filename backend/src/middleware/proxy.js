// Requests through the Netlify sites (doc 15.0). Each site proxies /api/* to the API with a
// signed proxy redirect: Netlify adds x-nf-sign, an HS256 JWS over { iss: "netlify", exp,
// site_url, ... } made with PROXY_SIGNING_SECRET. A valid one names the site the request came
// from, so:
//   - req.viaSite is 'web' (APP_URL) or 'admin' (ADMIN_CONSOLE_URL); the admin routes accept
//     the admin site (middleware/auth.js adminHostOnly)
//   - req.ip becomes the visitor's address that Netlify saw (x-nf-client-connection-ip), so the
//     per-address rate limits count each visitor, not Netlify's servers
// A missing or invalid signature trusts nothing. With REQUIRE_PROXY on, an API request without
// a valid one is turned away, so nobody can reach the API around the sites (and around their
// address); provider webhooks and health checks call the API directly and stay open.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { AppError } from '../utils/AppError.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const json = (part) => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};
const origin = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};
// a little leeway for clocks that disagree
const SKEW_S = 30;

/** The site a Netlify signature vouches for ('web' | 'admin'), or null. */
export function siteOf(token, env, now = Date.now()) {
  if (!env.PROXY_SIGNING_SECRET || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const header = json(h);
  if (header?.alg !== 'HS256') return null;
  const want = Buffer.from(b64url(createHmac('sha256', env.PROXY_SIGNING_SECRET).update(`${h}.${p}`).digest()));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const claims = json(p);
  if (claims?.iss !== 'netlify' || typeof claims.exp !== 'number' || claims.exp + SKEW_S < now / 1000) return null;
  const from = origin(claims.site_url);
  if (from && from === origin(env.ADMIN_CONSOLE_URL)) return 'admin';
  if (from && from === origin(env.APP_URL)) return 'web';
  return null;
}

// paths the providers and the platform call directly
const OPEN = [/^\/api\/v1\/webhooks\//, /^\/health$/, /^\/ready$/];

export function netlifyProxy(env) {
  return (req, res, next) => {
    const site = siteOf(req.get('x-nf-sign'), env);
    if (site) {
      req.viaSite = site;
      const ip = String(req.get('x-nf-client-connection-ip') ?? '').trim();
      if (isIP(ip)) Object.defineProperty(req, 'ip', { value: ip, configurable: true });
    } else if (env.REQUIRE_PROXY && req.path.startsWith('/api/') && !OPEN.some((re) => re.test(req.path))) {
      return next(new AppError(403, 'USE_THE_SITE', 'Use the SnackHub website or app'));
    }
    next();
  };
}

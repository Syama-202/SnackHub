import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Card, Icon, cx } from '../../components/ui';
import { ADMIN_CONSOLE_URL, PORTALS, signInPath, signUpPath } from '../../constants/auth';

/**
 * Pick a door: every role has its own sign-up and sign-in, and the admin console is a
 * separate private app with no public sign-up. Old /signin?as=seller links land on the
 * right portal.
 */
export default function Join() {
  const [params] = useSearchParams();
  const as = params.get('as');
  const next = params.get('next');
  if (as && PORTALS[as]) return <Navigate to={`${signInPath(as)}${next ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
  const keep = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <div className="page py-10 sm:py-16">
      <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-orange-text">Welcome to SnackHub</p>
      <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">How will you use SnackHub?</h1>
      <p className="mt-3 max-w-2xl text-lg text-grey-600">One account can order, sell and deliver. Each part has its own sign-in, so a customer login never opens a seller or rider console.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(PORTALS).map(([id, p]) => (
          <Card key={id} className="flex flex-col p-6">
            <span className={cx('grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-grey-900 shadow-cta', p.tone)}>
              <Icon name={p.icon} className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-2xl font-extrabold">{p.title}</h2>
            <p className="mt-2 flex-1 text-grey-600">{p.pitch}</p>
            <div className="mt-5 grid gap-2">
              <Link to={`${signUpPath(id)}${keep}`} className="inline-flex h-12 items-center justify-center rounded-full bg-primary font-bold text-grey-800 shadow-cta">
                Create a {p.label.toLowerCase()} account
              </Link>
              <Link to={`${signInPath(id)}${keep}`} className="inline-flex h-12 items-center justify-center rounded-full border border-white/80 bg-white/70 font-bold text-grey-800 shadow-sm backdrop-blur">
                Sign in
              </Link>
            </div>
          </Card>
        ))}
        <Card className="flex flex-col bg-grey-900 p-6 text-white" style={{ background: 'linear-gradient(160deg,#1F2937,#111827)' }}>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
            <Icon name="shield" className="h-7 w-7 text-sun" />
          </span>
          <h2 className="mt-4 text-2xl font-extrabold text-white">Admin access</h2>
          <p className="mt-2 flex-1 text-white/75">For the SnackHub team only. Staff accounts are created by the server owner, and every sign-in needs an authenticator code.</p>
          <a href={ADMIN_CONSOLE_URL} className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-white/10 font-bold text-white ring-1 ring-white/20 hover:bg-white/15">
            Open the admin console <Icon name="arrowRight" className="ml-1 h-4 w-4" />
          </a>
        </Card>
      </div>
    </div>
  );
}

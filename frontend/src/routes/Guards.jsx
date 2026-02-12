import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Spinner } from '../components/ui';

export function PageFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-orange-text" role="status">
      <Spinner className="h-8 w-8" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** UI gate only; the API re-checks the role from the token on every route. */
export function RequireRole({ role, children }) {
  const user = useSelector((s) => s.auth.user);
  const isInitializing = useSelector((s) => s.auth.isInitializing);
  const loc = useLocation();
  // Wait for the session check so a refresh does not bounce to sign-in
  if (isInitializing) return <PageFallback />;
  if (!user || user.role !== role) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}&as=${role}`} replace />;
  return children;
}

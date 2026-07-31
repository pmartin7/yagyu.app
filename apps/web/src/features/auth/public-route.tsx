import { Navigate } from 'react-router-dom';
import { useAuth } from './use-auth.js';

// Keeps signed-in users out of the landing and sign-in pages. Children render
// while auth resolves — public content is safe to show, and gating it behind a
// spinner would delay first paint for every anonymous visitor.
export function PublicRoute({ children }: { children: React.ReactNode }): JSX.Element {
  const { user, emailVerified, loading } = useAuth();

  if (loading || !user) {
    return <>{children}</>;
  }

  return <Navigate to={emailVerified ? '/welcome' : '/verify-email'} replace />;
}

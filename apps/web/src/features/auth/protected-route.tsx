import { Navigate } from 'react-router-dom';
import { AuthLoading } from './auth-loading.js';
import { useAuth } from './use-auth.js';

export function ProtectedRoute({ children }: { children: React.ReactNode }): JSX.Element {
  const { user, emailVerified, loading } = useAuth();

  if (loading) {
    return <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // The API rejects unverified tokens, so protected pages would only render
  // errors. Send the user back to the page that waits for verification.
  if (!emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  return <>{children}</>;
}

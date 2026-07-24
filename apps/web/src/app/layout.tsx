import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/use-auth.js';
import { Button } from '../components/ui/button.js';
import { HankoMark } from '../components/hanko-mark.js';

export function AppLayout(): JSX.Element {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <nav className="border-b border-border px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <HankoMark />
          <span className="font-display text-lg font-semibold text-ink lowercase tracking-tight">
            yagyu
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </nav>
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

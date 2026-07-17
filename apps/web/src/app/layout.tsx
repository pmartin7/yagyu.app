import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/use-auth.js';
import { Button } from '../components/ui/button.js';

export function AppLayout(): JSX.Element {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <nav className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-semibold text-gray-900 text-sm">
          yagyu.app
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          ) : (
            <Link to="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
        </div>
      </nav>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

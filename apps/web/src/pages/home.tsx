import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/use-auth.js';
import { Button } from '../components/ui/button.js';

export function HomePage(): JSX.Element {
  const { user } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
          Cut through the noise of your inbox
        </h1>
        <p className="text-lg text-gray-500">
          yagyu.app connects your email accounts, triages incoming mail with AI, and turns what
          matters into a clear, actionable todo list. Zen, focus, and clarity — the way of the
          Yagyu.
        </p>
        <div className="flex items-center justify-center gap-3">
          {!user && (
            <Link to="/login">
              <Button size="lg">Get started</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

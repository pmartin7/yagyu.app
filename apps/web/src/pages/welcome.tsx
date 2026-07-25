import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/use-auth.js';
import { useEmailAccounts } from '../features/email-accounts/use-email-accounts.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { HankoMark } from '../components/hanko-mark.js';

export function WelcomePage(): JSX.Element {
  const { user } = useAuth();
  const { accounts, error, link } = useEmailAccounts();
  const name = user?.displayName ?? user?.email ?? 'there';

  const handleLink = async (): Promise<void> => {
    try {
      await link();
    } catch {
      // error is already recorded by useEmailAccounts
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <HankoMark className="h-10 w-10" />
          <h1 className="font-display text-3xl font-semibold text-ink tracking-tight">
            Welcome, {name}
          </h1>
          <p className="text-ink-muted leading-relaxed">
            Your account is ready. The way of the inbox samurai begins now.
          </p>
          {accounts.length > 0 ? (
            <div className="text-sm text-ink-muted">
              <p>
                ✓ {accounts.length} Gmail account{accounts.length === 1 ? '' : 's'} linked
              </p>
              <Link to="/settings" className="text-primary hover:underline">
                Manage in settings
              </Link>
            </div>
          ) : (
            <>
              <Button onClick={handleLink}>Link your Gmail</Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

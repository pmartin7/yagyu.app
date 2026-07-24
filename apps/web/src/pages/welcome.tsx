import { useAuth } from '../features/auth/use-auth.js';
import { Card } from '../components/ui/card.js';
import { HankoMark } from '../components/hanko-mark.js';

export function WelcomePage(): JSX.Element {
  const { user } = useAuth();
  const name = user?.displayName ?? user?.email ?? 'there';

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
        </div>
      </Card>
    </div>
  );
}

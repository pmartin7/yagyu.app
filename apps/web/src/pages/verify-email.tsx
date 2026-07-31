import { Navigate, useNavigate } from 'react-router-dom';
import { AuthLoading } from '../features/auth/auth-loading.js';
import { useAuth } from '../features/auth/use-auth.js';
import { useEmailVerification } from '../features/auth/use-email-verification.js';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { HankoMark } from '../components/hanko-mark.js';

function resendLabel(cooldown: number, sending: boolean): string {
  if (cooldown > 0) return `Resend in ${cooldown}s`;
  return sending ? 'Sending…' : 'Resend verification email';
}

export function VerifyEmailPage(): JSX.Element {
  const { user, emailVerified, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { cooldown, sending, error, resend } = useEmailVerification();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return <AuthLoading />;
  }

  // Verifying from a browser without a session (a phone, say) still needs a
  // sign-in; the tab that started sign-up moves on through polling instead.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (emailVerified) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <HankoMark className="h-10 w-10" />
          <h1 className="font-display text-3xl font-semibold text-ink tracking-tight">
            Check your email
          </h1>
          <p className="text-ink-muted leading-relaxed max-w-full break-words">
            Verify <span className="text-ink">{user.email}</span> to continue. Open the link we
            emailed you and this page will carry you through.
          </p>
          <p className="text-xs text-ink-muted animate-pulse">Waiting for verification…</p>
          <Button onClick={resend} disabled={sending || cooldown > 0}>
            {resendLabel(cooldown, sending)}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Use a different account
          </Button>
        </div>
      </Card>
    </div>
  );
}

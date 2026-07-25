import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/use-auth.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Card } from '../components/ui/card.js';
import { HankoMark } from '../components/hanko-mark.js';

type Mode = 'signin' | 'signup' | 'check-email';

function errorMessage(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  switch (code) {
    case 'email-not-verified':
      return 'Please verify your email before signing in. Check your inbox for the link.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function firebaseCode(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

export function LoginPage(): JSX.Element {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleMode = (): void => {
    setMode(mode === 'signup' ? 'signin' : 'signup');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setMode('check-email');
      } else {
        await signIn(email, password);
        navigate('/welcome');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/welcome');
    } catch (err) {
      const code = firebaseCode(err);
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'check-email') {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-sm p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <HankoMark className="h-10 w-10" />
            <h1 className="font-display text-3xl font-semibold text-ink tracking-tight">
              Check your email
            </h1>
            <p className="text-ink-muted leading-relaxed">
              We sent a verification link to <span className="text-ink">{email}</span>. Verify
              your address, then sign in.
            </p>
            <Button variant="ghost" className="mt-2" onClick={() => setMode('signin')}>
              Back to sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center gap-4 mb-8">
          <HankoMark className="h-10 w-10" />
          <h1 className="font-display text-3xl font-semibold text-ink tracking-tight">
            {mode === 'signup' ? 'Create your account' : 'Sign in'}
          </h1>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full gap-2"
          disabled={loading}
          onClick={handleGoogle}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.87c2.27-2.09 3.58-5.17 3.58-8.66z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.94-2.92l-3.87-3a6.98 6.98 0 0 1-4.07 1.17c-3.13 0-5.78-2.11-6.73-4.96H1.24v3.11A11.99 11.99 0 0 0 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.6H1.24A11.99 11.99 0 0 0 0 12c0 1.93.46 3.76 1.24 5.4l4.03-3.11z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.24 6.6l4.03 3.11C6.22 6.86 8.87 4.75 12 4.75z"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 my-6">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-ink-muted">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading
              ? mode === 'signup'
                ? 'Creating account…'
                : 'Signing in…'
              : mode === 'signup'
                ? 'Sign up'
                : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-ink-muted mt-6">
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={toggleMode}
            className="text-ink underline underline-offset-2 hover:text-primary"
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </Card>
    </div>
  );
}

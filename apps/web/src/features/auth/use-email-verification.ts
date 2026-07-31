import { useEffect, useState } from 'react';
import { useAuth } from './use-auth.js';
import { remainingCooldownSeconds } from './verification-cooldown.js';

const POLL_INTERVAL_MS = 5_000;

interface EmailVerificationState {
  cooldown: number;
  sending: boolean;
  error: string | null;
  resend: () => Promise<void>;
}

// Watches the signed-in account until its email is verified, so the tab that
// started sign-up moves on by itself once the link is clicked anywhere.
export function useEmailVerification(): EmailVerificationState {
  const { refreshUser, resendVerification } = useAuth();
  const [cooldown, setCooldown] = useState(() => remainingCooldownSeconds());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A failed poll is not actionable — the next tick retries.
    const poll = (): void => void refreshUser().catch(() => undefined);
    // Checked immediately as well: landing here straight from the emailed link
    // means verification already happened, and waiting 5s to notice is jarring.
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshUser]);

  useEffect(() => {
    // Recomputed from the stored timestamp rather than decremented, so a
    // throttled tab cannot drift the countdown, and driven by one standing
    // interval so it cannot stall on a render React chooses to skip.
    const interval = setInterval(() => setCooldown(remainingCooldownSeconds()), 1000);
    return () => clearInterval(interval);
  }, []);

  const resend = async (): Promise<void> => {
    setError(null);
    setSending(true);
    try {
      await resendVerification();
    } catch {
      setError('Could not send the email. Please try again in a moment.');
    } finally {
      setCooldown(remainingCooldownSeconds());
      setSending(false);
    }
  };

  return { cooldown, sending, error, resend };
}

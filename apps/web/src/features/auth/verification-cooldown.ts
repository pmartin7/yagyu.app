const STORAGE_KEY = 'yagyu:verification-requested-at';
const RESEND_COOLDOWN_SECONDS = 60;

// Persisted rather than held in component state: the cooldown has to outlive
// the redirect from /login and a page reload, otherwise the Firebase send
// endpoint is one refresh away from being hammered. Access is guarded because
// sessionStorage throws outright when the browser blocks all storage, and this
// is read during render.
export function markVerificationRequested(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Without storage the cooldown just isn't enforced across navigations.
  }
}

export function remainingCooldownSeconds(): number {
  let requestedAt = 0;
  try {
    requestedAt = Number(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return 0;
  }
  if (!requestedAt) return 0;
  const remaining = Math.ceil(RESEND_COOLDOWN_SECONDS - (Date.now() - requestedAt) / 1000);
  // Clamped at both ends so a backward clock jump cannot strand the button.
  return Math.min(Math.max(remaining, 0), RESEND_COOLDOWN_SECONDS);
}

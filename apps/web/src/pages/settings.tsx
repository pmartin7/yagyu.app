import { LinkedAccountsSection } from '../features/email-accounts/linked-accounts-section.js';

export function SettingsPage(): JSX.Element {
  return (
    <div className="flex-1 px-4 py-12 sm:py-16">
      <div className="max-w-lg mx-auto w-full space-y-6">
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">Settings</h1>
        <LinkedAccountsSection />
      </div>
    </div>
  );
}

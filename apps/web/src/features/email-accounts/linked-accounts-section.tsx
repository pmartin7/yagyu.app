import { useState } from 'react';
import { Card } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { useEmailAccounts } from './use-email-accounts.js';

export function LinkedAccountsSection(): JSX.Element {
  const { accounts, loading, error, link, unlink } = useEmailAccounts();
  const [linking, setLinking] = useState(false);

  const handleLink = async (): Promise<void> => {
    setLinking(true);
    try {
      await link();
    } catch {
      // error is already recorded by useEmailAccounts
    } finally {
      setLinking(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <h2 className="font-display text-lg font-semibold text-ink">Linked accounts</h2>

      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && accounts.length === 0 && (
        <p className="text-sm text-ink-muted">No Gmail accounts linked yet.</p>
      )}

      {accounts.length > 0 && (
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <span className="text-sm text-ink">{account.emailAddress}</span>
              <Button variant="outline" size="sm" onClick={() => unlink(account.id)}>
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="default" onClick={handleLink} disabled={linking}>
        Link Gmail account
      </Button>
    </Card>
  );
}

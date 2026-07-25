import { useCallback, useEffect, useState } from 'react';
import type { EmailAccountResponse } from '@morpheus/shared';
import { apiRequest } from '../../lib/api-client.js';
import { requestGmailAuthCode } from '../../lib/google-identity.js';
import { useAuth } from '../auth/use-auth.js';

export function useEmailAccounts() {
  const { getToken } = useAuth();
  const [accounts, setAccounts] = useState<EmailAccountResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await apiRequest<EmailAccountResponse[]>('/api/email-accounts', {
        token: token ?? undefined,
      });
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load linked accounts');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const link = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const code = await requestGmailAuthCode();
      const token = await getToken();
      const account = await apiRequest<EmailAccountResponse>('/api/email-accounts/google', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify({ code }),
      });
      setAccounts((prev) => [...prev.filter((a) => a.id !== account.id), account]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link Gmail account');
      throw err;
    }
  }, [getToken]);

  const unlink = useCallback(
    async (id: string): Promise<void> => {
      setError(null);
      try {
        const token = await getToken();
        await apiRequest(`/api/email-accounts/${id}`, {
          method: 'DELETE',
          token: token ?? undefined,
        });
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unlink account');
      }
    },
    [getToken],
  );

  return { accounts, loading, error, link, unlink, refresh };
}

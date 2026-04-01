import { useChat } from '@ai-sdk/react';
import { useAuth } from '../auth/use-auth.js';

export function useChatStream(conversationId?: string) {
  const { getToken } = useAuth();

  return useChat({
    api: '/api/chat/send',
    body: conversationId ? { conversationId } : undefined,
    fetch: async (input, init) => {
      const token = await getToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });
}

import { ProtectedRoute } from '../features/auth/protected-route.js';
import { ChatPage as ChatFeaturePage } from '../features/chat/chat-page.js';

export function ChatPage(): JSX.Element {
  return (
    <ProtectedRoute>
      <ChatFeaturePage />
    </ProtectedRoute>
  );
}

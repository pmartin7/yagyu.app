import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layout.js';
import { AuthProvider } from '../features/auth/auth-provider.js';
import { ProtectedRoute } from '../features/auth/protected-route.js';
import { HomePage } from '../pages/home.js';
import { LoginPage } from '../pages/login.js';
import { WelcomePage } from '../pages/welcome.js';

export const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      {
        path: '/welcome',
        element: (
          <ProtectedRoute>
            <WelcomePage />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

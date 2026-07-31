import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layout.js';
import { AuthProvider } from '../features/auth/auth-provider.js';
import { ProtectedRoute } from '../features/auth/protected-route.js';
import { PublicRoute } from '../features/auth/public-route.js';
import { HomePage } from '../pages/home.js';
import { LoginPage } from '../pages/login.js';
import { SettingsPage } from '../pages/settings.js';
import { VerifyEmailPage } from '../pages/verify-email.js';
import { WelcomePage } from '../pages/welcome.js';

export const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    ),
    children: [
      {
        path: '/',
        element: (
          <PublicRoute>
            <HomePage />
          </PublicRoute>
        ),
      },
      {
        path: '/login',
        element: (
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        ),
      },
      // Unguarded: the visitor is signed in but not yet verified, which both
      // guards treat as a redirect case.
      { path: '/verify-email', element: <VerifyEmailPage /> },
      {
        path: '/welcome',
        element: (
          <ProtectedRoute>
            <WelcomePage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/settings',
        element: (
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

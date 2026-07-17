import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layout.js';
import { AuthProvider } from '../features/auth/auth-provider.js';
import { HomePage } from '../pages/home.js';
import { LoginPage } from '../pages/login.js';

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
    ],
  },
]);

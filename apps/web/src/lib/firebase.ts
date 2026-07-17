import { initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env['VITE_FIREBASE_API_KEY'],
  authDomain: import.meta.env['VITE_FIREBASE_AUTH_DOMAIN'],
  projectId: import.meta.env['VITE_FIREBASE_PROJECT_ID'],
  storageBucket: import.meta.env['VITE_FIREBASE_STORAGE_BUCKET'],
  messagingSenderId: import.meta.env['VITE_FIREBASE_MESSAGING_SENDER_ID'],
  appId: import.meta.env['VITE_FIREBASE_APP_ID'],
};

let cachedAuth: Auth | null = null;

// Lazy init: a missing Firebase config must not crash the app at load time —
// the landing page should render even before auth is configured.
export function getFirebaseAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  if (!firebaseConfig.apiKey) return null;
  cachedAuth = getAuth(initializeApp(firebaseConfig));
  return cachedAuth;
}

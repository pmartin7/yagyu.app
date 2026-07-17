import { useContext } from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase.js';
import { AuthContext } from './auth-provider.js';

function requireAuth() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase is not configured (missing VITE_FIREBASE_* env vars)');
  }
  return auth;
}

export function useAuth() {
  const { user, loading } = useContext(AuthContext);

  const signIn = (email: string, password: string) =>
    signInWithEmailAndPassword(requireAuth(), email, password);

  const signOut = () => firebaseSignOut(requireAuth());

  const getToken = async (): Promise<string | null> => {
    if (!user) return null;
    return user.getIdToken();
  };

  return { user, loading, signIn, signOut, getToken };
}

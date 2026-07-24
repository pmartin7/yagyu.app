import { useContext } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
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

  const signIn = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
    if (!credential.user.emailVerified) {
      await firebaseSignOut(requireAuth());
      throw new Error('email-not-verified');
    }
    return credential;
  };

  const signUp = async (email: string, password: string) => {
    const auth = requireAuth();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await sendEmailVerification(credential.user, { url: `${window.location.origin}/login` });
    } finally {
      await firebaseSignOut(auth);
    }
    return credential;
  };

  const signInWithGoogle = () => signInWithPopup(requireAuth(), new GoogleAuthProvider());

  const signOut = () => firebaseSignOut(requireAuth());

  const getToken = async (): Promise<string | null> => {
    if (!user) return null;
    return user.getIdToken();
  };

  return { user, loading, signIn, signUp, signInWithGoogle, signOut, getToken };
}

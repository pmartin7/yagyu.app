import { useCallback, useContext } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase.js';
import { AuthContext } from './auth-provider.js';
import { markVerificationRequested } from './verification-cooldown.js';

function requireAuth() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase is not configured (missing VITE_FIREBASE_* env vars)');
  }
  return auth;
}

async function sendVerification(user: FirebaseUser): Promise<void> {
  try {
    // Firebase appends its code to this URL, so clicking the link in the same
    // browser lands back on the page already polling for verification.
    await sendEmailVerification(user, { url: `${window.location.origin}/verify-email` });
  } finally {
    // Marked even on failure: the likely cause is Firebase rate limiting, and
    // an immediate retry would only dig the hole deeper.
    markVerificationRequested();
  }
}

export function useAuth() {
  const { user, emailVerified, loading, refreshUser } = useContext(AuthContext);

  const signIn = (email: string, password: string) =>
    signInWithEmailAndPassword(requireAuth(), email, password);

  // The session is deliberately kept after sign-up: the account is needed to
  // poll verification status and to resend the email from /verify-email.
  const signUp = async (email: string, password: string, displayName: string) => {
    const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
    // Sets the ID token's "name" claim, which the API stores as User.displayName
    // when it creates the row on the first authenticated request.
    await updateProfile(credential.user, { displayName });
    await sendVerification(credential.user);
    return credential;
  };

  const resendVerification = async (): Promise<void> => {
    const current = requireAuth().currentUser;
    if (!current) throw new Error('not-signed-in');
    await sendVerification(current);
  };

  const signInWithGoogle = () => signInWithPopup(requireAuth(), new GoogleAuthProvider());

  const signOut = () => firebaseSignOut(requireAuth());

  // Stable reference: consumers (e.g. useEmailAccounts) depend on this inside
  // useCallback/useEffect chains — a new function every render would re-fire
  // effects on every render and loop.
  const getToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  return {
    user,
    emailVerified,
    loading,
    refreshUser,
    signIn,
    signUp,
    resendVerification,
    signInWithGoogle,
    signOut,
    getToken,
  };
}

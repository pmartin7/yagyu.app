import { createContext, useCallback, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onIdTokenChanged } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase.js';

interface AuthContextValue {
  user: FirebaseUser | null;
  emailVerified: boolean;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  emailVerified: false,
  loading: true,
  refreshUser: () => Promise.resolve(),
});

// Read from the ID token, not from user.emailVerified: restoring a session
// refreshes that flag from the server but leaves the cached token alone, so a
// user who just verified would look verified here while still holding a token
// the API guard rejects. The claim is what the API actually sees.
async function tokenSaysVerified(user: FirebaseUser): Promise<boolean> {
  const { claims } = await user.getIdTokenResult();
  return claims['email_verified'] === true;
}

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    // onIdTokenChanged rather than onAuthStateChanged: it also fires on token
    // refresh, which is the moment verification becomes visible to the API.
    const unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setEmailVerified(false);
        setLoading(false);
        return;
      }
      // Resolves off the cached token, so loading ends in the same tick and no
      // guard ever routes on a half-initialised state.
      tokenSaysVerified(firebaseUser)
        .then(setEmailVerified)
        .catch(() => setEmailVerified(false))
        .finally(() => setLoading(false));
    });
    return unsubscribe;
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    const current = getFirebaseAuth()?.currentUser;
    if (!current) return;
    await current.reload();
    // Verification only reaches the API through a freshly minted token.
    if (current.emailVerified) await current.getIdToken(true);
    setEmailVerified(await tokenSaysVerified(current));
  }, []);

  return (
    <AuthContext.Provider value={{ user, emailVerified, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

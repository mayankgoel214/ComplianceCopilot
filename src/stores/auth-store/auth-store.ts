import { create } from 'zustand';
import { User } from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured, signInWithGoogle, logOut, initializeTokens } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthState {
  user: User | null;
  loading: boolean;
  isInitialized: boolean;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  initializeAuth: () => () => void;
  signIn: () => Promise<User | null>;
  signOut: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  // State
  user: null,
  loading: true,
  isInitialized: false,

  // Actions
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (isInitialized) => set({ isInitialized }),

  // Initialize Firebase auth listener
  initializeAuth: () => {
    // Runs from the root layout, so it is on the path of every page including
    // the ones that need no account. Without a Firebase project configured,
    // getAuth() throws and takes the entire client render with it — which is
    // what made the public demo page render an application error rather than
    // the demo. Settle as signed-out instead.
    if (!isFirebaseConfigured()) {
      set({ user: null, loading: false, isInitialized: true });
      return () => {};
    }

    // Initialize OAuth tokens from sessionStorage
    initializeTokens();

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      set({
        user,
        loading: false,
        isInitialized: true
      });
    });

    return unsubscribe;
  },

  // Auth methods
  signIn: async () => {
    set({ loading: true });
    try {
      const user = await signInWithGoogle();
      return user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await logOut();
      // User state will be updated by the auth listener
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
}));
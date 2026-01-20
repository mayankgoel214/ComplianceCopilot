import { create } from 'zustand';
import { User } from 'firebase/auth';
import { auth, signInWithGoogle, logOut, initializeTokens } from '@/lib/firebase/firebase';
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
    // Initialize OAuth tokens from sessionStorage
    initializeTokens();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
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
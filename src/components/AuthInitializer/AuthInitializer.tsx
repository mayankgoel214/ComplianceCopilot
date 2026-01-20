"use client";

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store/auth-store';

export default function AuthInitializer() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    // Initialize Firebase auth listener
    const unsubscribe = initializeAuth();

    // Cleanup function
    return () => {
      unsubscribe();
    };
  }, [initializeAuth]);

  // This component doesn't render anything
  return null;
}
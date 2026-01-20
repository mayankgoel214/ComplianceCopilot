import { act, renderHook } from '@testing-library/react'
import { useAuthStore } from './auth-store'
import { mockUser, resetFirebaseMocks, triggerAuthStateChange } from '@/__mocks__/firebase-auth'
import { User } from 'firebase/auth'

// Mock the firebase module
jest.mock('@/lib/firebase/firebase', () => ({
  auth: {
    currentUser: null,
  },
  signInWithGoogle: jest.fn(),
  logOut: jest.fn(),
}))

// Mock firebase/auth
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(() => jest.fn()), // Return unsubscribe function
}))

describe('Auth Store', () => {
  beforeEach(() => {
    resetFirebaseMocks()
    // Reset Zustand store state
    useAuthStore.setState({
      user: null,
      loading: true,
      isInitialized: false,
    })
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useAuthStore())

      expect(result.current.user).toBeNull()
      expect(result.current.loading).toBe(true)
      expect(result.current.isInitialized).toBe(false)
    })
  })

  describe('setUser', () => {
    it('should update user state', () => {
      const { result } = renderHook(() => useAuthStore())

      act(() => {
        result.current.setUser(mockUser as User)
      })

      expect(result.current.user).toEqual(mockUser)
    })

    it('should set user to null', () => {
      const { result } = renderHook(() => useAuthStore())

      // First set a user
      act(() => {
        result.current.setUser(mockUser as User)
      })

      // Then set to null
      act(() => {
        result.current.setUser(null)
      })

      expect(result.current.user).toBeNull()
    })
  })

  describe('setLoading', () => {
    it('should update loading state', () => {
      const { result } = renderHook(() => useAuthStore())

      act(() => {
        result.current.setLoading(false)
      })

      expect(result.current.loading).toBe(false)
    })
  })

  describe('setInitialized', () => {
    it('should update initialized state', () => {
      const { result } = renderHook(() => useAuthStore())

      act(() => {
        result.current.setInitialized(true)
      })

      expect(result.current.isInitialized).toBe(true)
    })
  })

  describe('signIn', () => {
    it('should call signInWithGoogle and update loading state', async () => {
      const mockSignInWithGoogle = require('@/lib/firebase/firebase').signInWithGoogle
      mockSignInWithGoogle.mockResolvedValue(mockUser)

      const { result } = renderHook(() => useAuthStore())

      let signInPromise: Promise<User | null>

      await act(async () => {
        signInPromise = result.current.signIn()
        await signInPromise
      })

      expect(mockSignInWithGoogle).toHaveBeenCalled()
    })

    it('should handle sign in error', async () => {
      const mockSignInWithGoogle = require('@/lib/firebase/firebase').signInWithGoogle
      const error = new Error('Sign in failed')
      mockSignInWithGoogle.mockRejectedValue(error)

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await expect(result.current.signIn()).rejects.toThrow('Sign in failed')
      })

      expect(result.current.loading).toBe(false)
    })
  })

  describe('signOut', () => {
    it('should call logOut and update loading state', async () => {
      const mockLogOut = require('@/lib/firebase/firebase').logOut
      mockLogOut.mockResolvedValue(undefined)

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await result.current.signOut()
      })

      expect(mockLogOut).toHaveBeenCalled()
    })

    it('should handle sign out error', async () => {
      const mockLogOut = require('@/lib/firebase/firebase').logOut
      const error = new Error('Sign out failed')
      mockLogOut.mockRejectedValue(error)

      const { result } = renderHook(() => useAuthStore())

      await act(async () => {
        await expect(result.current.signOut()).rejects.toThrow('Sign out failed')
      })

      expect(result.current.loading).toBe(false)
    })
  })

  describe('initializeAuth', () => {
    it('should set up auth state listener', () => {
      const { onAuthStateChanged } = require('firebase/auth')
      const { result } = renderHook(() => useAuthStore())

      const unsubscribe = result.current.initializeAuth()

      expect(typeof unsubscribe).toBe('function')
      expect(onAuthStateChanged).toHaveBeenCalled()
    })

    it('should handle auth state changes', () => {
      const { onAuthStateChanged } = require('firebase/auth')
      const { result } = renderHook(() => useAuthStore())

      // Mock onAuthStateChanged to immediately call the callback
      onAuthStateChanged.mockImplementation((auth, callback) => {
        callback(mockUser as User)
        return jest.fn() // unsubscribe function
      })

      act(() => {
        result.current.initializeAuth()
      })

      expect(result.current.user).toEqual(mockUser)
      expect(result.current.loading).toBe(false)
      expect(result.current.isInitialized).toBe(true)
    })
  })
})
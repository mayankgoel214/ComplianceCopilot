import { signInWithGoogle, logOut, getFirebaseAuth } from './firebase'
import { signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth'
import { mockUser } from '@/__mocks__/firebase-auth'

// Mock Firebase Auth functions
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: null,
    signInWithPopup: jest.fn(),
    signOut: jest.fn(),
  })),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
}))

// Mock Firebase app
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
}))

const mockSignInWithPopup = signInWithPopup as jest.MockedFunction<typeof signInWithPopup>
const mockSignOut = signOut as jest.MockedFunction<typeof signOut>

describe('Firebase Auth Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('signInWithGoogle', () => {
    it('should successfully sign in with Google', async () => {
      const mockResult = {
        user: mockUser,
        credential: null,
        providerId: 'google.com',
        operationType: 'signIn' as const,
      }

      mockSignInWithPopup.mockResolvedValue(mockResult as never)

      const result = await signInWithGoogle()

      expect(mockSignInWithPopup).toHaveBeenCalledWith(getFirebaseAuth(), expect.any(GoogleAuthProvider))
      expect(result).toBe(mockUser)
    })

    it('should handle sign in error', async () => {
      const error = new Error('Sign in failed')
      mockSignInWithPopup.mockRejectedValue(error)

      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await expect(signInWithGoogle()).rejects.toThrow('Sign in failed')

      expect(consoleSpy).toHaveBeenCalledWith('Error signing in with Google:', error)
      expect(mockSignInWithPopup).toHaveBeenCalledWith(getFirebaseAuth(), expect.any(GoogleAuthProvider))

      consoleSpy.mockRestore()
    })

    it('should handle network errors', async () => {
      const networkError = new Error('Network error')
      networkError.name = 'NetworkError'
      mockSignInWithPopup.mockRejectedValue(networkError)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await expect(signInWithGoogle()).rejects.toThrow('Network error')
      expect(consoleSpy).toHaveBeenCalledWith('Error signing in with Google:', networkError)

      consoleSpy.mockRestore()
    })
  })

  describe('logOut', () => {
    it('should successfully sign out', async () => {
      mockSignOut.mockResolvedValue()

      await expect(logOut()).resolves.toBeUndefined()

      expect(mockSignOut).toHaveBeenCalledWith(getFirebaseAuth())
    })

    it('should handle sign out error', async () => {
      const error = new Error('Sign out failed')
      mockSignOut.mockRejectedValue(error)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await expect(logOut()).rejects.toThrow('Sign out failed')

      expect(consoleSpy).toHaveBeenCalledWith('Error signing out:', error)
      expect(mockSignOut).toHaveBeenCalledWith(getFirebaseAuth())

      consoleSpy.mockRestore()
    })

    it('should handle getFirebaseAuth() state errors during sign out', async () => {
      const authError = new Error('Auth state error')
      authError.name = 'AuthError'
      mockSignOut.mockRejectedValue(authError)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await expect(logOut()).rejects.toThrow('Auth state error')
      expect(consoleSpy).toHaveBeenCalledWith('Error signing out:', authError)

      consoleSpy.mockRestore()
    })
  })

  describe('getFirebaseAuth() object', () => {
    it('should export getFirebaseAuth() object', () => {
      expect(getFirebaseAuth()).toBeDefined()
    })
  })
})
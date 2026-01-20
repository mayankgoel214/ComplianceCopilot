import { User } from 'firebase/auth'

// Mock user object for testing
export const mockUser: Partial<User> = {
  uid: 'mock-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
  emailVerified: true,
  isAnonymous: false,
  phoneNumber: null,
  providerData: [
    {
      uid: 'https://accounts.google.com/123456789',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
      phoneNumber: null,
      providerId: 'google.com',
    },
  ],
  getIdToken: jest.fn().mockResolvedValue('mock-id-token'),
  getIdTokenResult: jest.fn().mockResolvedValue({
    token: 'mock-id-token',
    expirationTime: new Date(Date.now() + 3600000).toISOString(),
    authTime: new Date().toISOString(),
    issuedAtTime: new Date().toISOString(),
    signInProvider: 'google.com',
    signInSecondFactor: null,
    claims: {},
  }),
  reload: jest.fn(),
  toJSON: jest.fn(),
  delete: jest.fn(),
}

// Mock Firebase Auth functions
export const mockFirebaseAuth = {
  currentUser: null as User | null,
  onAuthStateChanged: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
  getAuth: jest.fn(),
}

// Helper functions for testing
export const setMockUser = (user: User | null) => {
  mockFirebaseAuth.currentUser = user
}

export const triggerAuthStateChange = (user: User | null) => {
  const callbacks = mockFirebaseAuth.onAuthStateChanged.mock.calls.map(
    (call) => call[1] // The callback is the second argument
  )
  callbacks.forEach((callback) => callback(user))
}

// Reset all mocks
export const resetFirebaseMocks = () => {
  jest.clearAllMocks()
  mockFirebaseAuth.currentUser = null
}
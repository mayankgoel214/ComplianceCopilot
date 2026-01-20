export const testUsers = {
  validUser: {
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://example.com/photo.jpg',
  },

  invalidUser: {
    email: 'invalid@example.com',
    displayName: 'Invalid User',
  },
} as const

export const testData = {
  appTitle: 'Welcome to VTHacks 13',
  signInText: 'Please sign in to access your account',
  welcomeBackText: 'Welcome Back!',
  signedInText: 'You are successfully signed in',
} as const
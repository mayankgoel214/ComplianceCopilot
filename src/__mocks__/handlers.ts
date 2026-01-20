import { http, HttpResponse } from 'msw'

// Mock Firebase Auth API endpoints
export const handlers = [
  // Mock Google OAuth2 endpoint
  http.post('https://oauth2.googleapis.com/token', () => {
    return HttpResponse.json({
      access_token: 'mock_access_token',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: 'mock_id_token',
    })
  }),

  // Mock Firebase Auth sign in
  http.post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp', () => {
    return HttpResponse.json({
      localId: 'mock-user-id',
      email: 'test@example.com',
      displayName: 'Test User',
      photoUrl: 'https://example.com/photo.jpg',
      idToken: 'mock-id-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: '3600',
      federatedId: 'https://accounts.google.com/123456789',
      providerId: 'google.com',
      emailVerified: true,
    })
  }),

  // Mock Firebase Auth token refresh
  http.post('https://securetoken.googleapis.com/v1/token', () => {
    return HttpResponse.json({
      access_token: 'mock_new_access_token',
      expires_in: '3600',
      token_type: 'Bearer',
      refresh_token: 'mock_new_refresh_token',
      id_token: 'mock_new_id_token',
      user_id: 'mock-user-id',
      project_id: 'vthacks13-74208',
    })
  }),

  // Mock Firebase Auth get account info
  http.post('https://identitytoolkit.googleapis.com/v1/accounts:lookup', () => {
    return HttpResponse.json({
      users: [
        {
          localId: 'mock-user-id',
          email: 'test@example.com',
          displayName: 'Test User',
          photoUrl: 'https://example.com/photo.jpg',
          emailVerified: true,
          providerUserInfo: [
            {
              providerId: 'google.com',
              displayName: 'Test User',
              photoUrl: 'https://example.com/photo.jpg',
              federatedId: 'https://accounts.google.com/123456789',
              email: 'test@example.com',
            },
          ],
        },
      ],
    })
  }),

  // Mock Firebase Auth sign out
  http.post('https://identitytoolkit.googleapis.com/v1/accounts:delete', () => {
    return HttpResponse.json({
      kind: 'identitytoolkit#DeleteAccountResponse',
    })
  }),
]
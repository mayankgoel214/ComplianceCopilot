import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useAuthStore } from '@/stores/auth-store/auth-store'
import { toast } from 'sonner'
import Home from './page'
import { mockUser } from '@/__mocks__/firebase-auth'
import { User } from 'firebase/auth'

// Mock the auth store
jest.mock('@/stores/auth-store/auth-store')

// Mock Next.js Link component
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>
  }
})

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>
const mockToast = toast as jest.Mocked<typeof toast>

describe('Home Page', () => {
  const mockSignOut = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockSignOut.mockResolvedValue(undefined)
  })

  describe('Loading State', () => {
    it('should render loading skeleton when loading is true', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        loading: true,
        signOut: mockSignOut,
        isInitialized: false,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      render(<Home />)

      // Should show loading skeletons - using data-slot attribute from shadcn
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons).toHaveLength(3)
      expect(screen.queryByText('Welcome to VTHacks 13')).not.toBeInTheDocument()
    })
  })

  describe('Unauthenticated State', () => {
    it('should render sign in options when user is not authenticated', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        loading: false,
        signOut: mockSignOut,
        isInitialized: true,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      render(<Home />)

      expect(screen.getByText('Welcome to VTHacks 13')).toBeInTheDocument()
      expect(screen.getByText('Please sign in to access your account')).toBeInTheDocument()
      expect(screen.getByText('Sign In')).toBeInTheDocument()
      expect(screen.getByText('Create Account')).toBeInTheDocument()

      // Check links
      const signInLink = screen.getByText('Sign In').closest('a')
      const signUpLink = screen.getByText('Create Account').closest('a')
      expect(signInLink).toHaveAttribute('href', '/login')
      expect(signUpLink).toHaveAttribute('href', '/signup')
    })
  })

  describe('Authenticated State', () => {
    it('should render user info when authenticated', () => {
      mockUseAuthStore.mockReturnValue({
        user: mockUser as User,
        loading: false,
        signOut: mockSignOut,
        isInitialized: true,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      render(<Home />)

      expect(screen.getByText('Welcome Back!')).toBeInTheDocument()
      expect(screen.getByText('You are successfully signed in')).toBeInTheDocument()
      expect(screen.getByText('Test User')).toBeInTheDocument()
      expect(screen.getByText('test@example.com')).toBeInTheDocument()
      expect(screen.getByText('Sign Out')).toBeInTheDocument()
    })

    it('should render user photo when available', () => {
      mockUseAuthStore.mockReturnValue({
        user: { ...mockUser, photoURL: 'https://example.com/photo.jpg' } as User,
        loading: false,
        signOut: mockSignOut,
        isInitialized: true,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      render(<Home />)

      const userPhoto = screen.getByAltText('Test User')
      expect(userPhoto).toBeInTheDocument()
      expect(userPhoto).toHaveAttribute('src', 'https://example.com/photo.jpg')
    })

    it('should not render user photo when not available', () => {
      mockUseAuthStore.mockReturnValue({
        user: { ...mockUser, photoURL: null } as User,
        loading: false,
        signOut: mockSignOut,
        isInitialized: true,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      render(<Home />)

      expect(screen.queryByAltText('Test User')).not.toBeInTheDocument()
    })
  })

  describe('Sign Out Functionality', () => {
    it('should handle successful sign out', async () => {
      mockUseAuthStore.mockReturnValue({
        user: mockUser as User,
        loading: false,
        signOut: mockSignOut,
        isInitialized: true,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      render(<Home />)

      const signOutButton = screen.getByText('Sign Out')
      fireEvent.click(signOutButton)

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })

      expect(mockToast.success).toHaveBeenCalledWith('Logged out successfully!')
    })

    it('should handle sign out error', async () => {
      const error = new Error('Sign out failed')
      mockSignOut.mockRejectedValue(error)

      mockUseAuthStore.mockReturnValue({
        user: mockUser as User,
        loading: false,
        signOut: mockSignOut,
        isInitialized: true,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      render(<Home />)

      const signOutButton = screen.getByText('Sign Out')
      fireEvent.click(signOutButton)

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })

      expect(consoleSpy).toHaveBeenCalledWith('Logout error:', error)
      expect(mockToast.error).toHaveBeenCalledWith('Failed to log out. Please try again.')

      consoleSpy.mockRestore()
    })
  })

  describe('Accessibility', () => {
    it('should have proper title structure', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        loading: false,
        signOut: mockSignOut,
        isInitialized: true,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      render(<Home />)

      // Check for title text (CardTitle is a div, not a heading)
      expect(screen.getByText('Welcome to VTHacks 13')).toBeInTheDocument()
    })

    it('should have accessible buttons', () => {
      mockUseAuthStore.mockReturnValue({
        user: mockUser as User,
        loading: false,
        signOut: mockSignOut,
        isInitialized: true,
        setUser: jest.fn(),
        setLoading: jest.fn(),
        setInitialized: jest.fn(),
        initializeAuth: jest.fn(),
        signIn: jest.fn(),
      })

      render(<Home />)

      const signOutButton = screen.getByRole('button', { name: /sign out/i })
      expect(signOutButton).toBeInTheDocument()
    })
  })
})
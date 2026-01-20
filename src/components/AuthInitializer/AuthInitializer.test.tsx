import { render } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import AuthInitializer from './AuthInitializer';

// Mock the auth store
jest.mock('@/stores/auth-store/auth-store');

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

describe('AuthInitializer', () => {
  const mockInitializeAuth = jest.fn();
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeAuth.mockReturnValue(mockUnsubscribe);
    mockUseAuthStore.mockReturnValue(mockInitializeAuth);
  });

  it('should call initializeAuth on mount', () => {
    render(<AuthInitializer />);

    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);
  });

  it('should call cleanup function on unmount', () => {
    const { unmount } = render(<AuthInitializer />);

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('should render nothing (return null)', () => {
    const { container } = render(<AuthInitializer />);

    expect(container.firstChild).toBeNull();
  });

  it('should only initialize auth once even on re-renders', () => {
    const { rerender } = render(<AuthInitializer />);

    rerender(<AuthInitializer />);
    rerender(<AuthInitializer />);

    // Should still only be called once due to useEffect dependency array
    expect(mockInitializeAuth).toHaveBeenCalledTimes(1);
  });
});
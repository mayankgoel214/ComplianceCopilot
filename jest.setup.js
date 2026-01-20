import "@testing-library/jest-dom";

// Note: MSW setup commented out due to polyfill complexity in Jest environment
// For HTTP mocking in tests, consider using jest.mock() for individual modules
// import { server } from './src/__mocks__/server'

// Establish API mocking before all tests.
// beforeAll(() => server.listen({
//   onUnhandledRequest: 'error'
// }))

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
// afterEach(() => server.resetHandlers())

// Clean up after the tests are finished.
// afterAll(() => server.close())

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return "";
  },
}));

// Mock Firebase Auth
jest.mock("firebase/auth", () => ({
  getAuth: jest.fn(),
  onAuthStateChanged: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({
    addScope: jest.fn(),
    setCustomParameters: jest.fn(),
  })),
}));

// Mock sonner toast
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));

// Global test setup
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock ReadableStream for LangChain compatibility
global.ReadableStream = class ReadableStream {
  constructor() {
    this.reader = {
      read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
      cancel: jest.fn(),
      releaseLock: jest.fn(),
    };
  }

  getReader() {
    return this.reader;
  }

  cancel() {
    return Promise.resolve();
  }
};

// Mock WritableStream
global.WritableStream = class WritableStream {
  constructor() {
    this.writer = {
      write: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn().mockResolvedValue(undefined),
      releaseLock: jest.fn(),
    };
  }

  getWriter() {
    return this.writer;
  }

  close() {
    return Promise.resolve();
  }

  abort() {
    return Promise.resolve();
  }
};

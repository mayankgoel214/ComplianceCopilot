const nextJest = require("next/jest");

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: "./",
});

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  // Add setup files that run before any tests
  setupFiles: ["<rootDir>/jest.polyfills.js"],
  // Add more setup options before each test is run
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // Mock ES modules that cause issues
  moduleNameMapper: {
    // Handle module aliases
    "^@/components/(.*)$": "<rootDir>/src/components/$1",
    "^@/lib/(.*)$": "<rootDir>/src/lib/$1",
    "^@/stores/(.*)$": "<rootDir>/src/stores/$1",
    "^@/app/(.*)$": "<rootDir>/src/app/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    // Mock problematic ES modules
    "^p-queue$": "<rootDir>/src/__mocks__/p-queue.js",
    "^eventemitter3$": "<rootDir>/src/__mocks__/eventemitter3.js",
  },
  testMatch: ["**/__tests__/**/*.(ts|tsx|js)", "**/*.(test|spec).(ts|tsx|js)"],
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/tests/e2e/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.spec.{ts,tsx}",
    "!src/**/index.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config);

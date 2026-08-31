import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

const STUB_PORT = Number(process.env.STUB_PORT ?? 4599);
const STUB_URL = `http://localhost:${STUB_PORT}`;
// The stub is the default. Running against the real model is the opt-in,
// because the opposite default is what made a red pipeline mean nothing.
const useStub = !process.env.E2E_BASE_URL && !process.env.VERITY_E2E_REAL_MODEL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Started only when the caller has not pointed E2E_BASE_URL at something
  // already running, so the same suite can be aimed at the deployed site.
  //
  // Two servers when running locally: the app, and a stub standing in for the
  // model API. Without the stub this suite cannot run unless the Gemini account
  // is funded, which is how CI came to be red for a reason that had nothing to
  // do with the code. Set VERITY_E2E_REAL_MODEL=1 to spend real money instead.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        ...(useStub
          ? [
              {
                command: `node tests/stub/model-server.mjs`,
                url: `${STUB_URL}/healthz`,
                reuseExistingServer: !process.env.CI,
                timeout: 30_000,
                env: { STUB_PORT: String(STUB_PORT) },
              },
            ]
          : []),
        {
          command: `npx next dev --turbopack -p ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: useStub ? { VERITY_MODEL_BASE_URL: STUB_URL } : {},
        },
      ],
});

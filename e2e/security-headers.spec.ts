import { expect, test } from "@playwright/test";

/**
 * Security headers are configured once in `next.config.ts` and are invisible
 * everywhere else — nothing on the page looks different when they are missing,
 * which is how this deployment went seven months without any of them. These
 * assertions are what makes their absence a failing build rather than a
 * discovery made later by someone else.
 */
test.describe("security headers", () => {
  test("every response carries the constant headers", async ({ page }) => {
    const response = await page.goto("/");
    expect(response).not.toBeNull();
    const headers = response!.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });

  test("the policy forbids what it is there to forbid", async ({ page }) => {
    const response = await page.goto("/");
    const csp = response!.headers()["content-security-policy"];
    expect(csp).toBeTruthy();

    // A script may not be loaded from another origin, nothing may frame the
    // page, and no plugin content or base-tag rewrite is permitted. These are
    // the directives the policy actually enforces; script-src deliberately
    // permits inline, and next.config.ts records why.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("error reporting is not blocked by the policy that protects the page", async ({ page }) => {
    // Sentry runs in the browser, so a `connect-src 'self'` that forgets it
    // stops every error report while leaving the page working perfectly — the
    // failure is invisible precisely where it matters most.
    const response = await page.goto("/");
    const csp = response!.headers()["content-security-policy"] ?? "";
    const connectSrc = csp.split(";").find((d) => d.trim().startsWith("connect-src")) ?? "";

    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) {
      test.skip(true, "No DSN configured in this environment, so there is no origin to allow.");
      return;
    }
    expect(connectSrc).toContain(new URL(dsn).origin);
  });

  test("saved reports are kept out of search results", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response!.status()).toBe(200);
    const body = await response!.text();
    expect(body).toContain("Disallow: /r/");
  });
});

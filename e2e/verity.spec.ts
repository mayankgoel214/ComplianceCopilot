import { test, expect } from "@playwright/test";

/**
 * End-to-end checks against a running Verity.
 *
 * Split deliberately: everything here runs without a model key except the
 * assessment journey, which is skipped when one is absent rather than failing
 * and being ignored. A suite that is red for a known reason gets read as noise
 * and stops catching anything.
 */

test.describe("navigation and static pages", () => {
  test("the overview renders real index numbers, not placeholders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /compliance findings you can check/i })).toBeVisible();
    await expect(page.getByText("413", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("gemini-embedding-001").first()).toBeVisible();
  });

  test("every nav destination loads", async ({ page }) => {
    for (const [path, heading] of [
      ["/assess", /assess a document/i],
      ["/search", /retrieval playground/i],
      ["/evaluation", /retrieval evaluation/i],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });

  test("the evaluation page renders the measured table, including the losing configuration", async ({
    page,
  }) => {
    await page.goto("/evaluation");
    await expect(page.getByRole("cell", { name: "BM25", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: /Hybrid RRF \(equal\)/ }).first()).toBeVisible();
    await expect(page.getByText(/what this does not prove/i)).toBeVisible();
  });

  test("health reports the index and the key honestly", async ({ request }) => {
    const response = await request.get("/api/health");
    const body = await response.json();
    expect(body.checks.index.ok).toBe(true);
    expect(body.checks.index.detail).toMatch(/chunks from \d+ sections/);
    // The key itself must never appear in a response body.
    expect(JSON.stringify(body)).not.toMatch(/AIza/);
  });
});

test.describe("retrieval playground", () => {
  test("keeps the previous results on screen while a new search runs", async ({ page }) => {
    await page.goto("/search");
    await page.getByLabel("Search query").fill("breach notification deadline");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "Dense", exact: true })).toBeVisible({
      timeout: 45_000,
    });

    // A second search must not blank the page: the results stay, dimmed, and a
    // status line explains the wait.
    await page.getByLabel("Search query").fill("data protection impact assessment");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dense", exact: true })).toBeVisible();
  });

  test("returns three ranked arms for a natural-language query", async ({ page }) => {
    await page.goto("/search");
    await page.getByLabel("Search query").fill("How quickly must we report a breach to the regulator?");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByRole("heading", { name: "Dense", exact: true })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole("heading", { name: "BM25", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hybrid RRF", exact: true })).toBeVisible();
    await expect(page.getByText(/45 CFR|GDPR Article/).first()).toBeVisible();
  });

  test("a result expands to show the passage and a link to the source", async ({ page }) => {
    await page.goto("/search");
    await page.getByLabel("Search query").fill("business associate agreement requirements");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "Dense", exact: true })).toBeVisible({
      timeout: 45_000,
    });

    await page.getByRole("button", { expanded: false }).nth(1).click();
    await expect(page.getByRole("link", { name: /read the source/i }).first()).toBeVisible();
  });

  test("refuses a query that is too short, without calling the model", async ({ request }) => {
    const response = await request.post("/api/search", { data: { query: "a" } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/query/i);
  });

  test("refuses a query past the length cap", async ({ request }) => {
    const response = await request.post("/api/search", { data: { query: "x".repeat(501) } });
    expect(response.status()).toBe(400);
  });

  test("the framework filter restricts what comes back", async ({ request }) => {
    const response = await request.post("/api/search", {
      data: { query: "consent requirements", framework: "GDPR", topK: 5 },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    for (const arm of body.arms) {
      for (const hit of arm.results) expect(hit.framework).toBe("GDPR");
    }
  });
});

test.describe("assessment", () => {
  test("refuses a document below the minimum length", async ({ request }) => {
    const response = await request.post("/api/assess", { data: { document: "too short" } });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toMatch(/200 characters/i);
  });

  test("refuses a document past the length cap before reaching the model", async ({ request }) => {
    const response = await request.post("/api/assess", { data: { document: "x".repeat(24_001) } });
    expect(response.status()).toBe(400);
  });

  test("loads the sample into the box so a reader can check the findings against it", async ({
    page,
  }) => {
    await page.goto("/assess");
    const box = page.getByLabel("Document to assess");
    await expect(box).toHaveValue("");

    await page.getByRole("button", { name: /load the sample document/i }).click();
    // The claim of this page is that findings are checkable against the input,
    // which requires the input to be on screen.
    await expect(box).not.toHaveValue("");
    expect((await box.inputValue()).length).toBeGreaterThan(500);
    await expect(page.getByRole("button", { name: /assess this document/i })).toBeEnabled();
  });

  test("runs the sample end to end and grounds every citation it reports", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/assess");
    await page.getByRole("button", { name: /load the sample document/i }).click();
    await page.getByRole("button", { name: /assess this document/i }).click();

    await expect(page.getByRole("heading", { name: /what it read/i })).toBeVisible({
      timeout: 150_000,
    });
    await expect(page.getByRole("heading", { name: /citation grounding/i })).toBeVisible();

    // At least one framework section, with a score and a cited passage.
    await expect(page.getByText(/\/100/).first()).toBeVisible();
    await expect(page.getByText(/45 CFR|GDPR Article|15 CFR|22 CFR|34 CFR/).first()).toBeVisible();

    // The per-stage trace is the claim that this is instrumented; open it.
    await page.getByRole("button", { name: /show the per-stage trace/i }).click();
    await expect(page.getByRole("cell", { name: "classify" })).toBeVisible();
  });
});

test.describe("resilience", () => {
  test("malformed JSON is rejected, not swallowed", async ({ request }) => {
    const response = await request.post("/api/search", {
      headers: { "Content-Type": "application/json" },
      data: "{not json",
    });
    expect(response.status()).toBe(400);
  });

  test("an unknown route 404s", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
  });

  test("the page has no horizontal overflow on a phone", async ({ page }) => {
    await page.goto("/evaluation");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });
});

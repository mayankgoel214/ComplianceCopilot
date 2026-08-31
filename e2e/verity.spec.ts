import { test, expect } from "@playwright/test";

/**
 * End-to-end checks against a running Verity.
 *
 * Split by whether a test needs a model. Everything structural — navigation,
 * the evaluation tables, input validation, 404s, mobile layout — runs anywhere.
 * The tests that embed a query or run an assessment need a key, and they are
 * skipped with a stated reason when there is none rather than failing.
 *
 * That distinction matters because this suite runs in CI on a public
 * repository. A suite that is permanently red for a known and documented reason
 * stops being read, and then stops catching the failures it exists for. A
 * skipped test that says why it skipped is honest; a red one nobody looks at is
 * not.
 *
 * A key is assumed present when either the local environment has one — the dev
 * server Playwright starts inherits it — or the suite is aimed at a deployment
 * with `E2E_BASE_URL`, where the key lives on the server rather than here.
 */
const MODEL_AVAILABLE =
  Boolean(process.env.GOOGLE_GEMINI_API_KEY) || Boolean(process.env.E2E_BASE_URL);

const SKIP_REASON =
  "needs a model: set GOOGLE_GEMINI_API_KEY, or point E2E_BASE_URL at a deployment that has one";

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

  test("the evaluation page draws its charts from the measured numbers", async ({ page }) => {
    await page.goto("/evaluation");
    await expect(page.getByText("The same numbers, as shapes")).toBeVisible();
    await expect(page.getByRole("heading", { name: /recall at k/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /against latency/i })).toBeVisible();
    // One wrapper per chart. `recharts-surface` is nested several deep per
    // chart, so counting those counts an implementation detail rather than the
    // two charts this test is about.
    await expect(page.locator(".recharts-wrapper")).toHaveCount(2);
    // The lines are drawn from the measured numbers, so an empty chart is a
    // failure even when the container renders.
    expect(await page.locator(".recharts-line").count()).toBeGreaterThan(3);
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
    // The index must always load. Whether a key is configured is what varies,
    // and the endpoint reports it either way rather than pretending.
    expect(body.checks.index.ok).toBe(true);
    expect(typeof body.checks.model.ok).toBe("boolean");
    expect(body.checks.index.detail).toMatch(/chunks from \d+ sections/);
    // The key itself must never appear in a response body.
    expect(JSON.stringify(body)).not.toMatch(/AIza/);
  });
});

test.describe("retrieval playground", () => {
  // Only the arms that embed a query need the model; the two validation tests
  // below are outside this block and always run.
  test.describe("ranked results", () => {
    test.skip(!MODEL_AVAILABLE, SKIP_REASON);

  // `exact: true` on the submit button throughout: a non-exact name match also
  // hits every result row whose heading contains "Research", because "research"
  // contains "search". That only bites once the corpus surfaces Common Rule
  // sections, so it sat here green until the ranking changed underneath it.
  test("keeps the previous results on screen while a new search runs", async ({ page }) => {
    await page.goto("/search");
    await page.getByLabel("Search query").fill("breach notification deadline");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dense", exact: true })).toBeVisible({
      timeout: 45_000,
    });

    // A second search must not blank the page: the results stay, dimmed, and a
    // status line explains the wait.
    await page.getByLabel("Search query").fill("data protection impact assessment");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dense", exact: true })).toBeVisible();
  });

  test("returns three ranked arms for a natural-language query", async ({ page }) => {
    await page.goto("/search");
    await page.getByLabel("Search query").fill("How quickly must we report a breach to the regulator?");
    await page.getByRole("button", { name: "Search", exact: true }).click();

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
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dense", exact: true })).toBeVisible({
      timeout: 45_000,
    });

    await page.getByRole("button", { expanded: false }).nth(1).click();
    await expect(page.getByRole("link", { name: /read the source/i }).first()).toBeVisible();
  });

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
    test.skip(!MODEL_AVAILABLE, SKIP_REASON);
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

test.describe("file upload", () => {
  // Extraction needs no model, so these run everywhere.
  test("reads an uploaded text file into the box", async ({ page }) => {
    await page.goto("/assess");
    const box = page.getByLabel("Document to assess");
    await expect(box).toHaveValue("");

    await page.setInputFiles('input[type="file"]', {
      name: "plan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "DATA MANAGEMENT PLAN\n\n" +
          "Student identifiers and course grades are held in a PostgreSQL database. ".repeat(6),
        "utf8"
      ),
    });

    await expect(box).not.toHaveValue("", { timeout: 20_000 });
    await expect(page.getByText(/plan\.txt/)).toBeVisible();
    await expect(page.getByText(/characters/)).toBeVisible();
  });

  test("refuses a file type it cannot read, and says which it can", async ({ request }) => {
    const form = new FormData();
    form.set("file", new Blob([Buffer.alloc(2048, 1)], { type: "image/png" }), "diagram.png");
    const response = await request.post("/api/extract", { multipart: form as never });
    expect(response.status()).toBe(422);
    expect((await response.json()).error).toMatch(/PDF, Word/i);
  });

  test("refuses a decompression bomb before parsing it", async ({ request }) => {
    // A .docx is a zip. This one is small on the wire and declares an enormous
    // expansion; before the guard it allocated 400 MB server-side and returned
    // 200. The rejection has to be fast, because being slow is the attack.
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");

    const dir = mkdtempSync(path.join(tmpdir(), "verity-bomb-"));
    mkdirSync(path.join(dir, "word"), { recursive: true });
    writeFileSync(path.join(dir, "[Content_Types].xml"), "<Types/>");
    writeFileSync(
      path.join(dir, "word", "document.xml"),
      "<w:document><w:body>" + "A".repeat(60 * 1024 * 1024) + "</w:body></w:document>"
    );
    const archive = path.join(dir, "bomb.docx");
    execFileSync("zip", ["-r", "-9", "-q", archive, "[Content_Types].xml", "word"], { cwd: dir });

    const started = Date.now();
    const response = await request.post("/api/extract", {
      multipart: {
        file: { name: "bomb.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync(archive) },
      },
    });

    expect(response.status()).toBe(422);
    expect(await response.text()).toMatch(/expands to \d+ MB/);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test("refuses a request with no file attached", async ({ request }) => {
    const form = new FormData();
    const response = await request.post("/api/extract", { multipart: form as never });
    expect(response.status()).toBe(400);
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

  test("streams its stages while the run is in progress", async ({ page }) => {
    test.skip(!MODEL_AVAILABLE, SKIP_REASON);
    test.setTimeout(180_000);
    await page.goto("/assess");
    await page.getByRole("button", { name: /load the sample document/i }).click();
    await page.getByRole("button", { name: /assess this document/i }).click();

    // The first stage has to appear long before the run finishes, which is the
    // whole point of streaming it.
    await expect(page.getByRole("status")).toContainText(/reading the document/i, {
      timeout: 30_000,
    });
    // Then the classifier's frameworks turn into their own stages.
    await expect(page.getByRole("status")).toContainText(/retrieving and assessing/i, {
      timeout: 90_000,
    });
  });

  test("runs the sample end to end and grounds every citation it reports", async ({ page }) => {
    test.skip(!MODEL_AVAILABLE, SKIP_REASON);
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

test.describe("saved reports", () => {
  // These two hold with or without a database: loadReport returns null either
  // way, and a null report is a 404 rather than a blank page.
  test("a report id that does not exist is a 404, not a blank page", async ({ page }) => {
    const response = await page.goto("/r/aaaaaaaaaaaa");
    expect(response?.status()).toBe(404);
  });

  test("a malformed report id is refused without touching the database", async ({ page }) => {
    const response = await page.goto("/r/not-an-id!!");
    expect(response?.status()).toBe(404);
  });

  test("exporting a report that does not exist says so in plain text", async ({ request }) => {
    const response = await request.get("/api/report/aaaaaaaaaaaa/export");
    expect(response.status()).toBe(404);
    expect(await response.text()).toMatch(/does not exist|expired/i);
  });

  test("an assessment is saved, linkable and downloadable", async ({ page, request }) => {
    test.skip(!MODEL_AVAILABLE, SKIP_REASON);
    test.setTimeout(180_000);

    await page.goto("/assess");
    await page.getByRole("button", { name: /load the sample document/i }).click();
    await page.getByRole("button", { name: /assess this document/i }).click();
    await expect(page.getByRole("heading", { name: /what it read/i })).toBeVisible({
      timeout: 150_000,
    });

    // Saving needs a database, and Verity is built to run without one — the
    // core of it needs a single API key. So this asserts whichever behaviour is
    // correct for the environment it is running in, rather than skipping and
    // leaving the degraded path untested. CI has no DATABASE_URL and therefore
    // exercises the second branch every run.
    const permalink = page.getByRole("link", { name: /permalink/i });

    if ((await permalink.count()) === 0) {
      await expect(page.getByText(/not saved/i)).toBeVisible();
      await expect(page.getByText(/no database is configured/i)).toBeVisible();
      return;
    }

    // The permalink is offered next to the result, not buried at the bottom.
    await expect(permalink).toBeVisible();

    const href = await permalink.getAttribute("href");
    expect(href).toMatch(/^\/r\/[A-Za-z0-9_-]+$/);

    // The saved page must render for someone who never ran anything.
    const saved = await request.get(href!);
    expect(saved.status()).toBe(200);
    expect(await saved.text()).toContain("Citation grounding");

    const id = href!.split("/").pop()!;
    const exported = await request.get(`/api/report/${id}/export`);
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-type"]).toContain("text/markdown");
    expect(await exported.text()).toContain("# Compliance assessment");
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

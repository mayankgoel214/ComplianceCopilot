import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility, checked rather than assumed.
 *
 * axe finds a real subset of real problems — contrast, missing names, broken
 * landmark and heading structure — and finding none is not the same as being
 * accessible. It is, however, the part that can be automated, and a dark theme
 * built from a hand-picked palette is exactly where contrast quietly fails.
 *
 * Both themes are checked, because the light palette is a separate set of
 * values rather than an inversion, and a contrast failure in one says nothing
 * about the other.
 */

const PAGES = [
  { path: "/", name: "overview" },
  { path: "/assess", name: "assess" },
  { path: "/search", name: "search" },
  { path: "/evaluation", name: "evaluation" },
  { path: "/no-such-page", name: "404" },
];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

for (const theme of ["dark", "light"] as const) {
  test.describe(`accessibility · ${theme}`, () => {
    for (const page_ of PAGES) {
      test(`${page_.name} has no detectable violations`, async ({ page }) => {
        await page.goto(page_.path);
        await page.evaluate((t) => {
          localStorage.setItem("verity-theme", t);
          document.documentElement.setAttribute("data-theme", t);
        }, theme);
        // Let the palette swap settle before contrast is measured.
        await page.waitForTimeout(400);

        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

        // Reported in full rather than as a count, so a failure names the rule
        // and the element instead of sending you to a log.
        const summary = results.violations.map(
          (v) => `${v.id} (${v.impact}) × ${v.nodes.length}: ${v.help}`
        );
        expect(summary, summary.join("\n")).toEqual([]);
      });
    }
  });
}

test.describe("keyboard and structure", () => {
  test("every page has exactly one h1 and a main landmark", async ({ page }) => {
    for (const p of PAGES) {
      await page.goto(p.path);
      expect(await page.locator("h1").count(), `${p.path} h1 count`).toBe(1);
      expect(await page.locator("main").count(), `${p.path} main count`).toBe(1);
    }
  });

  test("the search form is operable by keyboard alone", async ({ page }) => {
    await page.goto("/search");
    await page.getByLabel("Search query").focus();
    await page.keyboard.type("breach notification");
    // Enter submits the form rather than requiring a pointer on the button.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").or(page.getByRole("heading", { name: "Dense", exact: true }))).toBeVisible({
      timeout: 45_000,
    });
  });

  test("the theme control names its current state", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /theme/i });
    await expect(toggle).toBeVisible();
    // The label has to say what it is now and what pressing it does; an icon
    // alone tells a screen reader nothing.
    const label = await toggle.getAttribute("aria-label");
    expect(label).toMatch(/theme:/i);
    expect(label).toMatch(/switch to/i);
  });
});

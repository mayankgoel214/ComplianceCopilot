/**
 * Records the walkthrough video.
 *
 *   npx tsx scripts/record-demo.mts [--base-url URL] [--out docs/verity-demo.mp4]
 *
 * Drives the real site with Playwright, captures full-page screenshots at each
 * beat, then hands the frames to caption-frames.py and ffmpeg. Nothing is
 * staged: the numbers in the video are whatever the deployment returns while
 * this runs, and a failed step fails the recording rather than being edited out.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "@playwright/test";

const FRAME_DIR = ".demo-frames";

function stringArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

interface Beat {
  /** Caption rendered above the screenshot. */
  caption: string;
  /** Seconds this beat stays on screen. */
  hold: number;
}

const beats: Beat[] = [];

/**
 * Scrolls the element a beat is about into view.
 *
 * Fixed pixel offsets were used here first, and they drift: expanding the trace
 * table pushes everything below it down, so a caption about citation grounding
 * ended up over a screenshot of the trace. Framing a beat by the thing it
 * describes cannot go out of sync with itself.
 */
async function frame(page: Page, heading: RegExp | string, offset = 90) {
  const target = page.getByRole("heading", { name: heading }).first();
  await target.scrollIntoViewIfNeeded();
  await page.evaluate((o) => window.scrollBy({ top: -o }), offset);
  await page.waitForTimeout(500);
}

async function shot(page: Page, index: number, caption: string, hold: number, fullPage = false) {
  await page.screenshot({
    path: path.join(FRAME_DIR, `${String(index).padStart(3, "0")}.png`),
    fullPage,
  });
  beats.push({ caption, hold });
}

async function main() {
  const baseUrl = stringArg("base-url", "https://verity-compliance.vercel.app");
  const out = stringArg("out", "docs/verity-demo.mp4");

  await rm(FRAME_DIR, { recursive: true, force: true });
  await mkdir(FRAME_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  let i = 0;
  console.log(`Recording against ${baseUrl}`);

  // 1. The overview.
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await shot(page, i++, "Verity reads a document, finds the regulations that apply, and cites them.", 4.5);

  await frame(page, /what is in the index/i);
  await shot(page, i++, "413 sections of real regulation text. 1,147 passages, embedded at 768 dimensions.", 4.5);

  // 2. The retrieval playground.
  await page.goto(`${baseUrl}/search`, { waitUntil: "networkidle" });
  await page.getByLabel("Search query").fill(
    "A laptop with 900 patient files was stolen from a car. What do we now owe, and to whom?"
  );
  await shot(page, i++, "The retrieval playground runs one query through every configuration at once.", 4);

  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("heading", { name: "Dense", exact: true }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await frame(page, "Dense", 140);
  await shot(page, i++, "Dense retrieval finds the breach-notification sections. BM25, on this phrasing, does not.", 5.5);

  // 3. The reranker.
  await page.getByLabel(/add the llm reranker/i).check();
  await page.getByRole("button", { name: "Search" }).click();
  const rerankArm = page.getByRole("heading", { name: "Hybrid + rerank", exact: true });
  await rerankArm.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(800);
  await rerankArm.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy({ top: -120 }));
  await page.waitForTimeout(500);
  await shot(page, i++, "The reranker reorders the fused candidates. On the held-out set that is worth +0.11 nDCG.", 5.5);

  // 4. The evaluation, including the configuration that lost.
  await page.goto(`${baseUrl}/evaluation`, { waitUntil: "networkidle" });
  await frame(page, /held-out slice/i);
  await shot(page, i++, "118 labelled queries, split dev and held-out. The one fitted parameter is chosen on dev alone.", 5.5);

  await frame(page, /the same numbers, as shapes/i);
  await page.waitForTimeout(1200);
  await shot(page, i++, "Reranking costs four orders of magnitude of latency to buy that quality. The axis is log for a reason.", 5.5);

  await frame(page, /choosing the fusion weight/i);
  await shot(page, i++, "The headline result is negative and the report leads with it: equal-weight fusion loses.", 5.5);

  await frame(page, /chunk size/i);
  await shot(page, i++, "Chunk size was swept across a fourfold range and deliberately left alone. The null result is the finding.", 5.5);

  // 5. Assessment, end to end.
  await page.goto(`${baseUrl}/assess`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /load the sample document/i }).click();
  await page.waitForTimeout(600);
  await shot(page, i++, "Paste a document, upload a PDF or Word file, or load the sample — so you can read what is being assessed.", 5);

  await page.getByRole("button", { name: /assess this document/i }).click();
  await page.waitForTimeout(4500);
  await shot(page, i++, "The pipeline streams. Each stage ticks over as it finishes, rather than a spinner over a blank panel.", 5);

  await page.waitForTimeout(11000);
  await shot(page, i++, "Frameworks arrive as they complete — the first at about twenty seconds, not all at the end.", 4.5);

  await page.getByRole("heading", { name: /what it read/i }).waitFor({ timeout: 180_000 });
  await page.waitForTimeout(1200);
  await frame(page, /citation grounding/i);
  await shot(page, i++, "Citation grounding: how many findings quoted text that was actually found in the source.", 5);

  const firstFramework = page.locator("section h2").filter({ hasText: /^[A-Z]/ }).last();
  await firstFramework.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy({ top: -90 }));
  await page.waitForTimeout(500);
  await shot(page, i++, "Each finding carries both quotes and the verdict on each — exact, near, or unsupported.", 6);

  // 6. The permalink, which is what makes a result worth keeping.
  const permalink = page.getByRole("link", { name: /permalink/i });
  await permalink.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, i++, "Every run is saved. A permalink and a Markdown export, so the result outlives the tab.", 4.5);

  const href = await permalink.getAttribute("href");
  if (href) {
    await page.goto(`${baseUrl}${href}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await shot(page, i++, "The saved report renders for someone who has never used Verity, and re-runs nothing.", 5);
  }

  // 7. Light theme, to show the design is a system rather than one palette.
  await page.evaluate(() => {
    localStorage.setItem("verity-theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
  });
  await page.waitForTimeout(700);
  await shot(page, i++, "A real light theme, with the verdict colours darkened rather than reused.", 4.5);

  await browser.close();

  await writeFile(path.join(FRAME_DIR, "beats.json"), JSON.stringify(beats, null, 2), "utf8");
  console.log(`\n${beats.length} frames captured in ${FRAME_DIR}/`);
  console.log(`Next: python3 scripts/caption-frames.py ${FRAME_DIR} ${out}`);
}

main().catch((err) => {
  console.error("\nrecording failed:", err.message);
  process.exit(1);
});

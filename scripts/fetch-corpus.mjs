#!/usr/bin/env node
/**
 * Builds the Verity retrieval corpus from authoritative public sources.
 *
 * US federal regulations are works of the United States government and are not
 * subject to copyright. The GDPR is published by the EU under a reuse policy
 * that permits redistribution with attribution.
 *
 * Two of the eight frameworks Verity classifies are deliberately absent:
 * SOC 2 (AICPA Trust Services Criteria) and ISO/IEC 27001 (Annex A) are
 * copyrighted by their publishers and cannot be redistributed in this repo.
 * Verity classifies documents against them but has no corpus to retrieve from,
 * and says so rather than substituting paraphrased text.
 *
 * Output: corpus/<framework>.jsonl, one JSON section per line.
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const ECFR_DATE = "2025-01-01";

const CFR_SOURCES = [
  { framework: "FERPA", title: 34, part: 99, label: "34 CFR Part 99 — Family Educational Rights and Privacy" },
  { framework: "IRB", title: 45, part: 46, label: "45 CFR Part 46 — Protection of Human Subjects (Common Rule)" },
  { framework: "HIPAA", title: 45, part: 160, label: "45 CFR Part 160 — HIPAA General Administrative Requirements" },
  { framework: "HIPAA", title: 45, part: 164, label: "45 CFR Part 164 — HIPAA Security and Privacy Rules" },
  { framework: "ADA/Section 508", title: 36, part: 1194, label: "36 CFR Part 1194 — Information and Communication Technology Standards" },
  { framework: "Export Controls (EAR/ITAR)", title: 15, part: 734, label: "15 CFR Part 734 — EAR Scope" },
  { framework: "Export Controls (EAR/ITAR)", title: 22, part: 120, label: "22 CFR Part 120 — ITAR Purpose and Definitions" },
];

// The CELEX permalink is behind bot protection; the Official Journal issue that
// carried the GDPR (OJ L 119, 4.5.2016) serves the same text and is fetchable.
const GDPR_URL =
  "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L:2016:119:FULL";
// OJ L 119 carries two acts. This prefix scopes extraction to the first of
// them, Regulation 2016/679, and excludes Directive 2016/680.
const GDPR_DOC_PREFIX = "L_2016119EN.01000101";
const GDPR_CITE_URL =
  "https://eur-lex.europa.eu/eli/reg/2016/679/oj";


const CACHE_DIR = ".corpus-cache";

/**
 * Fetches with a small on-disk cache and retries. EUR-Lex intermittently
 * answers 202 with an empty body while it warms a document; a single attempt
 * silently yields an empty corpus, which is the kind of quiet failure this
 * project exists to avoid.
 */
async function fetchText(url, { attempts = 4, minBytes = 1000 } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  const key = `${CACHE_DIR}/${createHash("sha1").update(url).digest("hex")}.cache`;
  try {
    const cached = await readFile(key, "utf8");
    if (cached.length >= minBytes) return cached;
  } catch {
    // no cache entry yet
  }

  let lastError = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000 * i));
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });
    const body = await res.text();
    if (res.ok && body.length >= minBytes) {
      await writeFile(key, body, "utf8");
      return body;
    }
    lastError = `HTTP ${res.status}, ${body.length} bytes`;
  }
  throw new Error(`${url} did not return usable content after ${attempts} attempts (${lastError})`);
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

async function fetchCfrPart({ framework, title, part, label }) {
  const url = `https://www.ecfr.gov/api/versioner/v1/full/${ECFR_DATE}/title-${title}.xml?part=${part}`;
  const xml = await fetchText(url);

  const sections = [];
  const divRe = /<DIV8\b[^>]*N="([^"]+)"[^>]*>([\s\S]*?)<\/DIV8>/g;
  let m;
  while ((m = divRe.exec(xml)) !== null) {
    const [, n, body] = m;
    const headMatch = body.match(/<HEAD>([\s\S]*?)<\/HEAD>/);
    const heading = headMatch ? stripTags(headMatch[1]) : `Section ${n}`;
    const paragraphs = [...body.matchAll(/<P>([\s\S]*?)<\/P>/g)].map((p) => stripTags(p[1]));
    const text = paragraphs.filter(Boolean).join("\n");
    if (text.length < 80) continue; // reserved / removed sections carry no content
    sections.push({
      framework,
      citation: `${title} CFR ${n}`,
      heading,
      source: label,
      source_url: `https://www.ecfr.gov/current/title-${title}/part-${part}/section-${n}`,
      text,
    });
  }
  // Several parts — 36 CFR 1194 most of all — carry their substance in
  // appendices rather than sections. Those are DIV9 blocks, split here on their
  // internal headings so a chapter does not arrive as one 40 kB chunk.
  const appRe = /<DIV9\b[^>]*N="([^"]+)"[^>]*>([\s\S]*?)<\/DIV9>/g;
  let a;
  while ((a = appRe.exec(xml)) !== null) {
    const [, appName, appBody] = a;
    const pieces = appBody.split(/(?=<HD1>)/);
    for (const piece of pieces) {
      const hd = piece.match(/<HD1>([\s\S]*?)<\/HD1>/);
      const heading = hd ? stripTags(hd[1]) : appName;
      if (/table of contents/i.test(heading)) continue;
      const text = [...piece.matchAll(/<(?:P|FP-2|FP-1|FP)>([\s\S]*?)<\/(?:P|FP-2|FP-1|FP)>/g)]
        .map((x) => stripTags(x[1]))
        .filter(Boolean)
        .join("\n");
      if (text.length < 120) continue;
      sections.push({
        framework,
        citation: `${title} CFR Part ${part}, ${appName}${hd ? ` — ${heading}` : ""}`,
        heading,
        source: label,
        source_url: `https://www.ecfr.gov/current/title-${title}/part-${part}`,
        text,
      });
    }
  }

  if (sections.length === 0) throw new Error(`No sections parsed from title ${title} part ${part}`);
  return sections;
}

async function fetchGdpr() {
  const html = await fetchText(GDPR_URL, { minBytes: 500000 });

  // Each article opens a div whose id ends in `.art_<n>`. Taking the span
  // between one article marker and the next avoids having to balance the
  // deeply nested divs EUR-Lex emits.
  const markerRe = new RegExp(
    `id="${GDPR_DOC_PREFIX}\\.art_(\\d+)"`,
    "g"
  );
  const markers = [...html.matchAll(markerRe)].map((m) => ({
    article: m[1],
    start: m.index,
  }));

  const sections = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].start;
    const end = i + 1 < markers.length ? markers[i + 1].start : html.length;
    const block = html.slice(start, end);

    const titleMatch = block.match(
      /<p[^>]*class="[^"]*oj-sti-art[^"]*"[^>]*>([\s\S]*?)<\/p>/
    );
    const heading = titleMatch ? stripTags(titleMatch[1]) : `Article ${markers[i].article}`;

    const bodyStart = titleMatch ? block.indexOf(titleMatch[0]) + titleMatch[0].length : 0;
    const text = [
      ...block.slice(bodyStart).matchAll(/<p[^>]*class="[^"]*oj-normal[^"]*"[^>]*>([\s\S]*?)<\/p>/g),
    ]
      .map((p) => stripTags(p[1]))
      .filter(Boolean)
      .join("\n");

    if (text.length < 120) continue;
    sections.push({
      framework: "GDPR",
      citation: `GDPR Article ${markers[i].article}`,
      heading,
      source: "Regulation (EU) 2016/679 — General Data Protection Regulation",
      source_url: `${GDPR_CITE_URL}#art_${markers[i].article}`,
      text,
    });
  }
  if (sections.length === 0) throw new Error("No GDPR articles parsed from EUR-Lex");
  return sections;
}

async function main() {
  await mkdir("corpus", { recursive: true });
  const byFramework = new Map();

  for (const src of CFR_SOURCES) {
    process.stdout.write(`fetching ${src.label} … `);
    const sections = await fetchCfrPart(src);
    console.log(`${sections.length} sections`);
    const list = byFramework.get(src.framework) ?? [];
    list.push(...sections);
    byFramework.set(src.framework, list);
  }

  process.stdout.write("fetching GDPR (EUR-Lex) … ");
  const gdpr = await fetchGdpr();
  console.log(`${gdpr.length} articles`);
  byFramework.set("GDPR", gdpr);

  let total = 0;
  for (const [framework, sections] of byFramework) {
    const file = path.join("corpus", `${framework.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jsonl`);
    await writeFile(file, sections.map((s) => JSON.stringify(s)).join("\n") + "\n", "utf8");
    console.log(`  wrote ${sections.length} → ${file}`);
    total += sections.length;
  }
  console.log(`\n${total} sections across ${byFramework.size} frameworks.`);
}

main().catch((err) => {
  console.error("corpus build failed:", err.message);
  process.exit(1);
});

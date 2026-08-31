/**
 * A local stand-in for the Gemini API, so the end-to-end suite can run without
 * a funded account.
 *
 * The suite used to drive a real browser against a real server that made real,
 * billed calls. When the prepayment credits ran out, CI went red for a reason
 * that had nothing to do with the code and would have stayed red until someone
 * paid. A pipeline that cannot tell you whether main is broken unless a credit
 * card is working is not doing its job.
 *
 * Two things this deliberately is not:
 *
 *   It is not reachable from a deployment. The client only accepts an override
 *   that is loopback and non-production — see src/lib/ai/endpoint.ts. A stub
 *   answering a visitor would be the exact failure this project argues against.
 *
 *   It is not a claim about retrieval quality. The embeddings here are hashed,
 *   not learned, so any assertion about *which* passage ranks first is
 *   meaningless against this server. The end-to-end suite asserts structure and
 *   behaviour — that three arms render, that a result expands, that the stream
 *   emits its stages, that a report saves and loads. Retrieval quality is
 *   measured by the evaluation harness against the real model, and that is the
 *   only place it is claimed.
 *
 * The one place the stub has to be careful is grounding. Every finding is
 * verified against the passages the model was shown, so a stub that invented
 * quotes would be correctly rejected and the pipeline would report zero
 * supported findings — a green suite testing nothing. So it parses the passages
 * out of the prompt it was given and quotes them verbatim, which is what the
 * real model is instructed to do.
 */
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const PORT = Number(process.env.STUB_PORT ?? 4599);
const DIMENSIONS = 768;

/**
 * A deliberate delay on generation calls.
 *
 * The real pipeline takes about twenty-five seconds and streams its stages as
 * they complete; that streaming is a feature with a test asserting a stage is
 * visible *while the run is in progress*. A stub that answers in under a
 * millisecond finishes the whole run before the browser paints once, so the
 * assertion races and loses -- which is what it did in CI while passing on a
 * slower laptop.
 *
 * So the stub is slow on purpose. Small enough to keep the suite quick, large
 * enough that the intermediate states genuinely exist and are genuinely
 * observed rather than being timing luck.
 */
const GENERATE_DELAY_MS = Number(process.env.STUB_GENERATE_DELAY_MS ?? 400);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A deterministic unit vector for a string.
 *
 * Deterministic so a rerun ranks identically — a flaky ordering would produce
 * a flaky suite. Unit length because the application normalises corpus vectors
 * and treats a dot product as a cosine; a stub returning unnormalised vectors
 * would hide exactly the bug that was found in the real path.
 */
function embed(text) {
  const vector = new Float64Array(DIMENSIONS);
  // Enough hash material to fill the vector without cycling.
  for (let block = 0; block * 32 < DIMENSIONS; block++) {
    const digest = createHash("sha256").update(`${block}:${text}`).digest();
    for (let i = 0; i < 32 && block * 32 + i < DIMENSIONS; i++) {
      vector[block * 32 + i] = (digest[i] - 127.5) / 127.5;
    }
  }
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  return Array.from(vector, (v) => v / norm);
}

/** Pulls `[n] CITATION — HEADING\ntext` blocks back out of the prompt. */
function parsePassages(prompt) {
  const section = prompt.split("Regulation passages:")[1];
  if (!section) return [];
  const body = section.split("Submitted document:")[0] ?? section;

  const passages = [];
  const re = /\[(\d+)\]\s+(.+?)\s+—\s+(.+?)\n([\s\S]*?)(?=\n\[\d+\]\s|\s*$)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    passages.push({ citation: m[2].trim(), heading: m[3].trim(), text: m[4].trim() });
  }
  return passages;
}

/**
 * A verbatim run of words from the passage, long enough to clear the schema's
 * 10-character minimum and to be found by the verifier's sliding window.
 */
function quoteFrom(passage) {
  const sentence =
    passage.text
      .split(/(?<=\.)\s+/)
      .map((s) => s.trim())
      .find((s) => s.length >= 40) ?? passage.text;
  return sentence.slice(0, 300).trim();
}

function classificationFor(prompt) {
  // Named by what the document actually mentions, so the stubbed run exercises
  // more than one framework path when the document warrants it.
  const lower = prompt.toLowerCase();
  const candidates = [
    ["FERPA", /student|grade|education record|transcript/],
    ["HIPAA", /health|patient|clinical|medical|phi/],
    ["GDPR", /gdpr|europe|german|international transfer|data subject/],
  ];

  const frameworks = candidates
    .filter(([, re]) => re.test(lower))
    .map(([name]) => ({
      name,
      confidence: 0.8,
      rationale: `The document describes handling that falls under ${name}.`,
      concerns: [
        "storage of records without stated access controls",
        "sharing of records with third parties",
      ],
    }));

  return {
    frameworks: frameworks.length > 0 ? frameworks : [
      {
        name: "FERPA",
        confidence: 0.6,
        rationale: "The document describes record handling in an academic setting.",
        concerns: ["storage of records without stated access controls"],
      },
    ],
    documentSummary:
      "A data management plan describing how records are collected, stored and shared, produced by the local test stub.",
  };
}

function assessmentFor(prompt) {
  const passages = parsePassages(prompt);
  if (passages.length === 0) return { findings: [] };

  const findings = passages.slice(0, 3).map((passage, i) => ({
    requirement: `${passage.heading} applies to the handling described here`,
    status: i === 0 ? "missing" : "partial",
    severity: i === 0 ? "high" : "medium",
    explanation:
      "The plan does not describe the safeguards this section requires, so the obligation appears unmet. Produced by the local test stub.",
    documentQuote: "",
    regulationQuote: quoteFrom(passage),
    citation: passage.citation,
  }));

  return { findings };
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const url = req.url ?? "";
    const json = (payload) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    try {
      // Playwright waits on this before starting the app.
      if (url.startsWith("/healthz")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }

      if (url.includes(":batchEmbedContents")) {
        const parsed = JSON.parse(body);
        return json({
          embeddings: parsed.requests.map((r) => ({
            values: embed(r.content.parts.map((p) => p.text).join(" ")),
          })),
        });
      }

      if (url.includes(":generateContent")) {
        await sleep(GENERATE_DELAY_MS);
        const parsed = JSON.parse(body);
        const prompt = (parsed.contents ?? [])
          .flatMap((c) => c.parts ?? [])
          .map((p) => p.text ?? "")
          .join("\n");
        const system = (parsed.systemInstruction?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("\n");

        // Which call this is, decided by the schema the caller asked for rather
        // than by guessing from the prompt.
        const wantsClassification = /documentSummary/.test(
          JSON.stringify(parsed.generationConfig?.responseSchema ?? {})
        ) || /which frameworks/i.test(system);

        const payload = wantsClassification
          ? classificationFor(prompt)
          : assessmentFor(prompt);

        return json({
          candidates: [
            {
              content: { parts: [{ text: JSON.stringify(payload) }], role: "model" },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 },
        });
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: `stub has no route for ${url}` } }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: String(error) } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[stub] model server on http://localhost:${PORT}`);
});

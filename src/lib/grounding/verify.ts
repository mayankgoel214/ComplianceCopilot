/**
 * Citation grounding.
 *
 * The model is asked to quote the text it relied on. This checks that the quote
 * is actually in the source, because a model that is wrong about a compliance
 * requirement is a bug and a model that invents the sentence it was quoting is
 * the same bug wearing a citation. Every claim carries a verdict, and a claim
 * whose quote cannot be found in the source it names is labelled as such in the
 * response rather than being quietly dropped — a reader needs to know the
 * difference between "we found no gaps" and "we found gaps we could not stand
 * behind".
 */

export type GroundingVerdict = "exact" | "near" | "unsupported";

export interface GroundedClaim<T> {
  claim: T;
  quote: string;
  verdict: GroundingVerdict;
  /** Token-level overlap with the best-matching window of the source, 0-1. */
  similarity: number;
  /** Character offset of the best match in the normalised source, when found. */
  offset: number | null;
}

export interface GroundingReport<T> {
  claims: GroundedClaim<T>[];
  totals: {
    total: number;
    exact: number;
    near: number;
    unsupported: number;
    /** Share of claims whose quote was found exactly or near-exactly. */
    groundedRate: number;
  };
}

/** Near-match threshold. Below this a quote is not treated as supported. */
const NEAR_THRESHOLD = 0.75;
/** Quotes shorter than this are too short to verify meaningfully. */
const MIN_QUOTE_TOKENS = 4;

function normalise(text: string): string {
  return text
    .toLowerCase()
    // Regulation text is full of typographic quotes and dashes that a model
    // silently converts to ASCII when it quotes. Folding them is the difference
    // between a false "unsupported" and a true one.
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return normalise(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Best token-overlap between the quote and any same-length window of the source.
 *
 * A sliding window rather than a bag-of-words comparison over the whole source:
 * a quote whose words all appear in a 4,000-word section but never together is
 * not a quotation, and a whole-source comparison would score it as one.
 */
function bestWindowOverlap(quoteTokens: string[], sourceTokens: string[]): number {
  if (quoteTokens.length === 0 || sourceTokens.length === 0) return 0;

  const window = quoteTokens.length;
  const needed = new Map<string, number>();
  for (const t of quoteTokens) needed.set(t, (needed.get(t) ?? 0) + 1);

  if (sourceTokens.length < window) {
    const have = new Map<string, number>();
    for (const t of sourceTokens) have.set(t, (have.get(t) ?? 0) + 1);
    let matched = 0;
    for (const [t, count] of needed) matched += Math.min(count, have.get(t) ?? 0);
    return matched / window;
  }

  const have = new Map<string, number>();
  let matched = 0;

  const addToken = (t: string) => {
    const before = have.get(t) ?? 0;
    have.set(t, before + 1);
    if (before < (needed.get(t) ?? 0)) matched++;
  };
  const removeToken = (t: string) => {
    const before = have.get(t) ?? 0;
    have.set(t, before - 1);
    if (before <= (needed.get(t) ?? 0)) matched--;
  };

  for (let i = 0; i < window; i++) addToken(sourceTokens[i]);
  let best = matched;

  for (let i = window; i < sourceTokens.length; i++) {
    addToken(sourceTokens[i]);
    removeToken(sourceTokens[i - window]);
    if (matched > best) best = matched;
  }

  return best / window;
}

/**
 * Verifies one quote against one or more candidate sources.
 *
 * The sources are the passages that were actually retrieved and put in front of
 * the model. Verifying against the whole corpus instead would accept a quote
 * the model could not have seen, which would defeat the purpose.
 */
export function verifyQuote(quote: string, sources: string[]): { verdict: GroundingVerdict; similarity: number; offset: number | null } {
  const normalisedQuote = normalise(quote);
  const quoteTokens = tokens(quote);

  if (quoteTokens.length < MIN_QUOTE_TOKENS) {
    return { verdict: "unsupported", similarity: 0, offset: null };
  }

  let bestSimilarity = 0;
  for (const source of sources) {
    const normalisedSource = normalise(source);
    const offset = normalisedSource.indexOf(normalisedQuote);
    if (offset !== -1) return { verdict: "exact", similarity: 1, offset };

    const similarity = bestWindowOverlap(quoteTokens, tokens(source));
    if (similarity > bestSimilarity) bestSimilarity = similarity;
  }

  return {
    verdict: bestSimilarity >= NEAR_THRESHOLD ? "near" : "unsupported",
    similarity: bestSimilarity,
    offset: null,
  };
}

/** Verifies a batch of claims, each carrying one quote, against shared sources. */
export function verifyClaims<T>(
  claims: Array<{ claim: T; quote: string }>,
  sources: string[]
): GroundingReport<T> {
  const verified: GroundedClaim<T>[] = claims.map(({ claim, quote }) => ({
    claim,
    quote,
    ...verifyQuote(quote, sources),
  }));

  const exact = verified.filter((c) => c.verdict === "exact").length;
  const near = verified.filter((c) => c.verdict === "near").length;
  const unsupported = verified.filter((c) => c.verdict === "unsupported").length;

  return {
    claims: verified,
    totals: {
      total: verified.length,
      exact,
      near,
      unsupported,
      groundedRate: verified.length === 0 ? 1 : (exact + near) / verified.length,
    },
  };
}

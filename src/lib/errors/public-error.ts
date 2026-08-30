/**
 * Turning an upstream failure into something safe to show a stranger.
 *
 * Both API routes used to answer with `error.message.slice(0, 400)`. When the
 * Gemini account's prepayment credits ran out, that meant the public search
 * endpoint returned this, verbatim, to anyone who asked:
 *
 *   Embedding request failed (429): { "error": { "code": 429, "message":
 *   "Your prepayment credits are depleted. Please go to AI Studio at ... } }
 *
 * Two problems, one of them not obvious. The visible one is that it reads as a
 * crash rather than a service limit. The quieter one is that echoing a
 * provider's raw response is an information-disclosure habit: today it discloses
 * a billing state, and the next upstream error message is written by someone
 * who was not thinking about what a public endpoint would do with it. An error
 * string is attacker-influenced data — a malformed request can often pick which
 * upstream error comes back — so the safe default is that no upstream text
 * reaches a response body at all.
 *
 * So classification happens here, the operator detail stays in the server log,
 * and the client gets a fixed sentence chosen from a set written in advance.
 */

export type FailureKind =
  | "model-budget"
  | "model-busy"
  | "model-auth"
  | "model-timeout"
  | "unknown";

export interface PublicFailure {
  kind: FailureKind;
  /** Safe to render. Never contains upstream text. */
  message: string;
  status: number;
  /** Whether trying the same thing shortly is reasonable. */
  retryable: boolean;
}

const FAILURES: Record<FailureKind, Omit<PublicFailure, "kind">> = {
  "model-budget": {
    message:
      "Verity's model budget for this billing period is spent, so new assessments can't run right now. Everything already assessed is still readable, and the repository runs the whole pipeline locally against your own API key.",
    status: 503,
    retryable: false,
  },
  "model-busy": {
    message: "The model is rate-limiting requests at the moment. Try again in a minute.",
    status: 503,
    retryable: true,
  },
  "model-auth": {
    // Deliberately vague. That a key is missing or rejected is an operator's
    // problem and a prober's hint.
    message: "Verity is not able to reach its model right now. This is being looked at.",
    status: 503,
    retryable: false,
  },
  "model-timeout": {
    message: "The model took too long to respond. Try again — long documents sometimes need a second run.",
    status: 504,
    retryable: true,
  },
  unknown: {
    message: "Something failed on our side. Try again, and if it keeps happening the repository has an issue tracker.",
    status: 500,
    retryable: true,
  },
};

/**
 * Classifies by the substrings providers actually put in these responses.
 *
 * Matching on message text is unlovely and it is what is available: the SDK
 * collapses HTTP status into a prose message. The cost of a miss is only that
 * a specific failure is reported as a generic one, which is why `unknown` is a
 * complete answer rather than a fallthrough.
 */
export function classifyFailure(error: unknown): FailureKind {
  const text = error instanceof Error ? error.message : String(error);
  const lower = text.toLowerCase();

  if (
    lower.includes("prepayment credits") ||
    lower.includes("credits are depleted") ||
    lower.includes("billing") ||
    lower.includes("quota exceeded") ||
    lower.includes("exceeded your current quota")
  ) {
    return "model-budget";
  }
  if (lower.includes("resource_exhausted") || lower.includes("(429)") || lower.includes("429 ")) {
    return "model-busy";
  }
  if (
    lower.includes("api_key") ||
    lower.includes("api key") ||
    lower.includes("permission_denied") ||
    lower.includes("unauthenticated") ||
    lower.includes("(401)") ||
    lower.includes("(403)")
  ) {
    return "model-auth";
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return "model-timeout";
  }
  return "unknown";
}

/**
 * The one function routes should call. Logs the real error for an operator and
 * returns only what a stranger may see.
 */
export function toPublicFailure(error: unknown, context: string): PublicFailure {
  const kind = classifyFailure(error);

  // Full detail, server side only.
  console.error(`[${context}] ${kind}:`, error);

  return { kind, ...FAILURES[kind] };
}

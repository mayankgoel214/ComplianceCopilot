/**
 * Where the model API lives, and the one situation in which that may be moved.
 *
 * CI could not pass without a funded Gemini account: the end-to-end suite drove
 * a real browser against a real server that made real, billed calls. When the
 * account's prepayment credits ran out, the pipeline went red for a reason that
 * had nothing to do with the code, and would have stayed red until someone paid.
 * A test suite that cannot run without a working credit card is not a test suite
 * you can rely on to tell you whether main is broken.
 *
 * So the base URL is overridable, and the tests point it at a local stub.
 *
 * The override is the dangerous part, and it is guarded rather than trusted.
 * Substituting a stand-in for a model is precisely the failure this project
 * exists to argue against — a stub returns confident nonsense by construction —
 * so it must be impossible for one to be answering a real visitor. Two
 * conditions, both required: the process must not be a production build, and
 * the URL must be loopback. Anything else throws at startup rather than being
 * quietly ignored, because a silently ignored override is how you end up
 * believing you tested something.
 */

const REAL_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function isLoopback(url: URL): boolean {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1" ||
    url.hostname === "0.0.0.0"
  );
}

/**
 * `env` is a parameter rather than a direct read of `process.env` so the guard
 * can be tested without mutating the real one — NODE_ENV is typed read-only,
 * and a test that reassigns globals leaks into whatever runs next anyway.
 */
export function getModelBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.VERITY_MODEL_BASE_URL;
  if (!override) return REAL_BASE_URL;

  if (env.NODE_ENV === "production" && !env.VERITY_ALLOW_STUB_IN_PROD_BUILD) {
    throw new Error(
      "VERITY_MODEL_BASE_URL is set in a production build. A stubbed model must " +
        "never answer a real request. Unset it, or set " +
        "VERITY_ALLOW_STUB_IN_PROD_BUILD=1 if this is a CI run of a production build."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(override);
  } catch {
    throw new Error(`VERITY_MODEL_BASE_URL is not a valid URL: ${override}`);
  }

  if (!isLoopback(parsed)) {
    throw new Error(
      `VERITY_MODEL_BASE_URL must point at loopback, not ${parsed.hostname}. ` +
        "The override exists so tests can run without a funded account, not to " +
        "redirect a deployment at a third party."
    );
  }

  return override.replace(/\/$/, "");
}

/** True when this process is talking to a stub. Surfaced in /api/health. */
export function isUsingStubModel(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VERITY_MODEL_BASE_URL);
}

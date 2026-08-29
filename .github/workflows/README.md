CI runs typecheck, lint, the Jest suite (including the pgvector integration
suite against a real Postgres service container), a production build, and the
Playwright end-to-end suite.

The end-to-end suite needs a `GOOGLE_GEMINI_API_KEY` repository secret for the
tests that embed a query or run an assessment. Without it those tests fail
rather than silently passing — a green suite that skipped the only tests that
touch the model is worse than a red one.

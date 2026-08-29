CI runs typecheck, lint, the Jest suite (including the pgvector integration
suite against a real Postgres service container), a production build, and the
Playwright end-to-end suite.

## The model key

Five end-to-end tests embed a query or run a full assessment, and need
`GOOGLE_GEMINI_API_KEY` as a repository secret. Without it they **skip with a
stated reason** rather than failing.

That is a deliberate choice and it is worth being explicit about the tradeoff,
because the opposite choice is defensible too. Failing loudly guarantees nobody
mistakes a partial run for a complete one. But this is a public repository, and
a suite that is permanently red for a known reason stops being read — at which
point it has stopped catching the failures it exists for, which is the worse
outcome. A skipped test that names its reason keeps both properties: the gap is
visible, and a real regression still turns the badge red.

The remaining twelve tests cover navigation, the evaluation tables, input
validation, rate-limit and length rejection, 404s and mobile layout, and run
everywhere with no key at all.

## Fork pull requests

GitHub does not expose secrets to workflows triggered by a fork's pull request,
so those runs exercise the twelve key-free tests and skip the five. That is the
intended behaviour, not a hole to plug: a public repository should not hand a
billable API key to an arbitrary contributor's branch.

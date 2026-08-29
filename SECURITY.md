# Security

## Known credential exposure in this repository's history

On 2026-08-29 a `gitleaks` scan of the full history found that the initial
commit, `fe1fc3d` (2026-01-20), included a file named `env.download` carrying
live credentials. The file was removed from the working tree in `cc18ed1`, but
removing a file does not remove it from history, and this repository is public.

Exposed:

| Value | Status |
| --- | --- |
| `FIREBASE_PRIVATE_KEY` (service account) | Must be rotated |
| `DATABASE_URL` (Neon, password included) | Must be rotated or the project deleted |
| `GOOGLE_GEMINI_API_KEY` | Must be rotated |

The Firebase *web* API key that also appears in the history is public by design
and is not a secret; it is deleted along with the rest of the Firebase
integration, which Verity no longer uses.

History was deliberately **not** rewritten. Once a secret has been readable in a
public repository, rewriting history does not un-expose it — GitHub retains
unreachable commits and public repositories are indexed continuously. Rotation
is the only remediation that means anything, and pretending otherwise would be
worse than leaving the record visible.

## How Verity handles secrets now

There is exactly one: `GOOGLE_GEMINI_API_KEY`. It is read through
`getGeminiApiKey()` in `src/lib/ai/config.ts`, which throws when it is unset,
and it is never included in a response body — `/api/health` reports only whether
a key is configured. `.env*` is gitignored.

## Reporting

This is a portfolio project. Open an issue.

// Runs before anything else loads.
//
// Node 20+ supplies fetch, Request, Response and Headers natively, so the
// previous hand-written shims here are gone. They were not equivalent to the
// real classes — the fake Headers was a Map, which meant `headers.get()`
// behaved differently in tests than in production, and rate-limit tests passed
// against behaviour the server never had.
import { TextEncoder, TextDecoder } from "util";

if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;

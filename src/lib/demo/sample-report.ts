/**
 * The worked example.
 *
 * A visitor arriving at Verity has two ways to see what it produces: run an
 * assessment, which costs a model call and about twenty-five seconds, or read
 * one that has already been run. The second is worth having on its own — most
 * people want to know what the output looks like before deciding whether to
 * paste a document into it — and it becomes the only one when the model is
 * unavailable, which stopped being hypothetical the day the API account's
 * prepayment credits ran out and every route that needed a model went dark.
 *
 * This report is pinned in the database: exempt from the 30-day retention sweep
 * that clears ordinary reports. It is a real run over the sample document, not
 * a fixture — same pipeline, same retrieval, same verification.
 */
export const SAMPLE_REPORT_ID = "bi4Nb2FFKfwW";
export const SAMPLE_REPORT_PATH = `/r/${SAMPLE_REPORT_ID}`;

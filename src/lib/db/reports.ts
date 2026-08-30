import { createHash, randomBytes } from "node:crypto";

import { db, isDatabaseConfigured } from "./client";
import type { AssessmentResult } from "../pipeline/assess";

/**
 * Saved assessments.
 *
 * A run costs about thirty seconds and a cent, and until now it evaporated on
 * refresh. Saving it makes the result something you can come back to and send
 * to someone — which for a tool whose whole argument is "check this yourself"
 * is closer to the point than a nice-to-have.
 *
 * Two things follow from storing a document somebody pasted in:
 *
 *   The id is random, not sequential. These are shared by link, and a
 *   sequential id would let anyone enumerate every document ever submitted.
 *
 *   Rows expire. Thirty days is written into the schema default and swept on
 *   write, so the retention promise the interface makes is enforced by the
 *   database rather than by a cron job nobody checks.
 */

const ID_BYTES = 9; // 72 bits, base64url — 12 characters, not worth guessing at.

export interface SavedReport {
  id: string;
  document: string;
  result: AssessmentResult;
  createdAt: Date;
  expiresAt: Date;
}

export function hashDocument(document: string): string {
  return createHash("sha256").update(document.trim()).digest("hex");
}

function newId(): string {
  return randomBytes(ID_BYTES).toString("base64url");
}

/**
 * Saves a report and returns its id, or null when there is no database.
 *
 * Null rather than throwing: an assessment that ran is worth showing even if it
 * could not be persisted, and losing the save is not a reason to lose the run.
 * The caller tells the reader that saving did not happen.
 */
export async function saveReport(
  document: string,
  result: AssessmentResult
): Promise<{ id: string; expiresAt: Date } | null> {
  if (!isDatabaseConfigured) return null;

  const id = newId();
  const sql = db();

  try {
    const [row] = await sql<{ expires_at: Date }[]>`
      insert into reports
        (id, document, document_hash, result, framework_count, finding_count, grounded_rate)
      values (
        ${id},
        ${document},
        ${hashDocument(document)},
        ${sql.json(result as unknown as Parameters<typeof sql.json>[0])},
        ${result.frameworks.length},
        ${result.grounding.totalFindings},
        ${result.grounding.groundedRate}
      )
      returning expires_at
    `;

    // Swept here rather than on a schedule. At this write volume it costs
    // nothing, and it cannot quietly stop running the way a cron can.
    await sql`select purge_expired_reports()`;

    return { id, expiresAt: row.expires_at };
  } catch (error) {
    console.error("Could not save report:", error);
    return null;
  }
}

export async function loadReport(id: string): Promise<SavedReport | null> {
  if (!isDatabaseConfigured) return null;

  // Ids are base64url from a fixed byte length, so anything else is not a
  // truncated id — it is someone probing, and it is refused without a query.
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(id)) return null;

  const sql = db();
  try {
    const rows = await sql<
      { id: string; document: string; result: AssessmentResult; created_at: Date; expires_at: Date }[]
    >`
      select id, document, result, created_at, expires_at
      from reports
      where id = ${id} and expires_at > now()
    `;
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      document: row.document,
      result: row.result,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  } catch (error) {
    console.error("Could not load report:", error);
    return null;
  }
}

/**
 * The most recent unexpired report for an identical document.
 *
 * This is the cheap half of caching: an identical document assessed twice
 * produces the same work, and the result is already sitting in a row. The model
 * is not deterministic, so this is a cache of a previous answer rather than a
 * guarantee of the same one — which is why the interface says a result was
 * reused rather than pretending it just ran.
 */
export async function findCachedReport(document: string): Promise<SavedReport | null> {
  if (!isDatabaseConfigured) return null;

  const sql = db();
  try {
    const rows = await sql<
      { id: string; document: string; result: AssessmentResult; created_at: Date; expires_at: Date }[]
    >`
      select id, document, result, created_at, expires_at
      from reports
      where document_hash = ${hashDocument(document)} and expires_at > now()
      order by created_at desc
      limit 1
    `;
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      id: row.id,
      document: row.document,
      result: row.result,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  } catch (error) {
    console.error("Could not look for a cached report:", error);
    return null;
  }
}

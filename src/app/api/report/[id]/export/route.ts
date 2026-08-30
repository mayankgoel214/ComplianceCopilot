import { loadReport } from "@/lib/db/reports";
import { reportToMarkdown } from "@/lib/reports/markdown";

/**
 * A saved report as a Markdown download.
 *
 * Reads the stored row rather than re-running anything, so an export costs no
 * model calls and is not rate limited.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const report = await loadReport(id);

  if (!report) {
    return new Response("That report does not exist, or it has expired.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const url = new URL(request.url);
  const markdown = reportToMarkdown(report.result, {
    id: report.id,
    url: `${url.origin}/r/${report.id}`,
    assessedAt: report.createdAt,
  });

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="verity-${report.id}.md"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Verity — compliance findings you can check";

interface EvalResults {
  gold: { total: number; test: number };
  configs: Array<{ name: string; test: { recallAt: Record<string, number>; ndcg: number } }>;
}

/**
 * The link-preview card.
 *
 * The headline numbers are read from the committed evaluation results rather
 * than typed in, for the same reason every other number on this site is: a card
 * quoting a metric is exactly where a stale figure survives longest, because
 * nobody looks at it again. This one carried the project's old name and the
 * phrase "LangChain agents" for a while after both stopped being true.
 *
 * If the results file is missing, the card drops the numbers rather than
 * inventing them.
 */
async function loadBest(): Promise<{ ndcg: number; recall: number; n: number } | null> {
  try {
    const results = JSON.parse(await readFile("eval/results.json", "utf8")) as EvalResults;
    const best = results.configs.reduce((a, b) => (b.test.ndcg > a.test.ndcg ? b : a));
    return { ndcg: best.test.ndcg, recall: best.test.recallAt["10"], n: results.gold.test };
  } catch {
    return null;
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 40, color: "#F1F5F9" }}>{value}</div>
      <div style={{ fontSize: 20, color: "#64748B", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default async function OgImage() {
  const best = await loadBest();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0B1120",
          padding: 80,
        }}
      >
        <div style={{ fontSize: 28, color: "#38BDF8", letterSpacing: 3 }}>VERITY</div>
        <div style={{ fontSize: 62, color: "#F1F5F9", marginTop: 26, lineHeight: 1.12 }}>
          Compliance findings you can check.
        </div>
        <div style={{ fontSize: 26, color: "#94A3B8", marginTop: 28, lineHeight: 1.4 }}>
          Every finding quotes the regulation behind it, and every quote is verified
          against the source before you see it.
        </div>
        {best ? (
          <div style={{ display: "flex", gap: 56, marginTop: 42 }}>
            <Stat
              value={`${(best.recall * 100).toFixed(1)}%`}
              label={`recall@10, ${best.n} held-out queries`}
            />
            <Stat value={best.ndcg.toFixed(3)} label="nDCG@10" />
            <Stat value="413" label="sections of regulation" />
          </div>
        ) : null}
      </div>
    ),
    size
  );
}

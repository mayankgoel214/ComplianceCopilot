"use client";

import { useState } from "react";
import { Loader2, AlertTriangle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DEMO_DOCUMENT,
  DEMO_PROJECT_DESCRIPTION,
} from "@/lib/demo/fixture";

interface DemoResult {
  frameworks: Array<{
    name: string;
    confidence: number;
    priority: string;
    reasoning: string;
  }>;
  overallScore: number | null;
  frameworkScores: Array<{
    framework: string;
    overallScore: number;
    readinessLevel: string;
    gaps: Array<{
      requirement: string;
      severity: string;
      evidence: string[];
    }>;
  }>;
  elapsedMs: number;
  runsRemainingThisHour: number;
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "text-red-700",
  high: "text-red-600",
  medium: "text-amber-600",
  low: "text-slate-600",
};

export default function DemoPage() {
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/demo/analyze", { method: "POST" });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "The analysis failed.");
        return;
      }
      setResult(body);
    } catch {
      setError("Could not reach the analysis service.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">
          ComplianceCopilot — live demo
        </h1>
        <p className="text-muted-foreground mt-3 text-pretty">
          This runs the real pipeline. A classification agent reads the document
          below and decides which regulatory frameworks apply; a grading agent
          then scores it against each one and says what in the document it is
          reacting to. Those notes are the model&rsquo;s own summary of the
          problem rather than a verbatim quote, so the document is printed in
          full below to check them against. Nothing here is pre-computed — the
          same run on the same text can come back slightly differently, which
          is what using a model actually looks like.
        </p>
      </header>

      <section className="mb-8 rounded-lg border">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">The document it analyses</h2>
          <p className="text-muted-foreground mt-1 text-sm text-pretty">
            Fixed, so the demo cannot be made to spend more than it should. It
            has real problems in it on purpose — read it and check the findings
            against it rather than taking the scores on faith.
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto px-4 py-3">
          <p className="text-muted-foreground mb-3 text-sm italic text-pretty">
            {DEMO_PROJECT_DESCRIPTION}
          </p>
          <pre className="text-xs whitespace-pre-wrap break-words font-mono leading-relaxed">
            {DEMO_DOCUMENT}
          </pre>
        </div>
      </section>

      <Button onClick={run} disabled={running} size="lg">
        {running && <Loader2 className="mr-2 size-4 animate-spin" />}
        {running ? "Analysing — this takes 20 to 40 seconds" : "Run the analysis"}
      </Button>

      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p className="min-w-0 text-sm text-amber-900">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-10 space-y-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-4xl font-bold">
              {result.overallScore ?? "—"}
              <span className="text-muted-foreground text-lg">/100</span>
            </span>
            <span className="text-muted-foreground text-sm">
              {(result.elapsedMs / 1000).toFixed(1)}s ·{" "}
              {result.runsRemainingThisHour} run
              {result.runsRemainingThisHour === 1 ? "" : "s"} left this hour
            </span>
          </div>

          <section>
            <h2 className="mb-3 font-semibold">Frameworks it identified</h2>
            <div className="space-y-3">
              {result.frameworks.map((f) => (
                <div key={f.name} className="min-w-0 rounded-lg border px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.name}</span>
                    <Badge variant="secondary">
                      {(f.confidence * 100).toFixed(0)}% confidence
                    </Badge>
                    <Badge variant="outline">{f.priority}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm text-pretty">
                    {f.reasoning}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-semibold">Scores and gaps</h2>
            <div className="space-y-4">
              {result.frameworkScores.map((s) => (
                <div key={s.framework} className="min-w-0 rounded-lg border">
                  <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                    <ShieldCheck className="size-4 shrink-0" />
                    <span className="min-w-0 font-medium">{s.framework}</span>
                    <span className="text-muted-foreground text-sm">
                      {s.overallScore}/100
                    </span>
                    <Badge variant="outline">
                      {s.readinessLevel.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <ul className="divide-y">
                    {s.gaps.map((g, i) => (
                      <li key={i} className="min-w-0 px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span
                            className={`text-xs font-semibold uppercase ${
                              SEVERITY_TONE[g.severity] ?? "text-slate-600"
                            }`}
                          >
                            {g.severity}
                          </span>
                          <span className="min-w-0 text-sm">{g.requirement}</span>
                        </div>
                        {g.evidence.length > 0 && (
                          <p className="text-muted-foreground mt-1.5 border-l-2 pl-3 text-xs text-pretty">
                            {g.evidence[0]}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

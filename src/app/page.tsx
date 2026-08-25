import Link from "next/link";
import { ArrowRight, FileSearch, Scale, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The public front page.
 *
 * This route used to be the signed-in projects dashboard — a duplicate of
 * /projects — so an unauthenticated visitor was bounced to a login form for a
 * product they had never seen described.
 */
export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:py-28">
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Read a data management plan the way a regulator would.
        </h1>

        <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg text-pretty">
          ComplianceCopilot reads project documents, works out which frameworks
          actually apply — FERPA, HIPAA, GDPR, the Common Rule, export control —
          and scores the document against each, quoting the passage behind every
          finding.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/demo">
            <Button size="lg" className="w-full sm:w-auto">
              Try the live demo
              <ArrowRight className="size-5" />
            </Button>
          </Link>
          <a
            href="https://github.com/mayankgoel214/ComplianceCopilot"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Read the code
            </Button>
          </a>
        </div>

        <p className="text-muted-foreground mt-5 text-sm">
          The demo runs the real model. No account needed.
        </p>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:grid-cols-3">
          {[
            {
              icon: FileSearch,
              title: "Retrieval that is checkable",
              body: "Documents are chunked semantically and embedded, and every finding cites the passage it came from — so a reviewer can disagree with it.",
            },
            {
              icon: Layers,
              title: "Agents with separate jobs",
              body: "One decides which frameworks apply. Another scores against them. A third proposes remediation. Each answers against a schema rather than in prose.",
            },
            {
              icon: Scale,
              title: "Twelve frameworks",
              body: "FERPA, HIPAA, GDPR, COPPA, the Common Rule, SOC 2, ISO 27001, Section 508, ITAR, EAR, CCPA and PIPEDA.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="min-w-0">
              <Icon className="text-muted-foreground size-6" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto max-w-5xl px-4 py-8 text-sm">
          Built by Mayank Goel. The full application behind this — projects,
          Google Drive ingestion, saved reports — needs an account; the demo
          above does not.
        </div>
      </footer>
    </main>
  );
}

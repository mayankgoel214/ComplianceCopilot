import Link from "next/link";

export const metadata = { title: "Not found — Verity" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">There is nothing here.</h1>
      <p className="text-fg-muted leading-relaxed">
        That URL does not match anything Verity serves. It has four pages, and they are all
        below.
      </p>
      <ul className="space-y-2 text-sm">
        {[
          ["/", "Overview — what it is, and what is in the index"],
          ["/assess", "Assess a document — run the pipeline and check its citations"],
          ["/search", "Retrieval playground — one query, every configuration"],
          ["/evaluation", "Evaluation — recall@k, MRR and nDCG on a held-out set"],
        ].map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="underline underline-offset-4 hover:text-fg">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

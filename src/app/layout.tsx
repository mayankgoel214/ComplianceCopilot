import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";

import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  // Without metadataBase the generated og:image resolves relative and the
  // link-preview card comes out blank.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
  ),
  title: "Verity — compliance findings you can check",
  description:
    "Retrieval over 413 sections of FERPA, HIPAA, GDPR, the Common Rule, Section 508 and export-control text. Every finding quotes the regulation behind it, and every quote is verified against the source before you see it.",
  openGraph: {
    title: "Verity",
    description:
      "A compliance assessment pipeline with a measured retrieval stack and verified citations. Recall@10, MRR and nDCG on a held-out set, published.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/assess", label: "Assess a document" },
  { href: "/search", label: "Retrieval playground" },
  { href: "/evaluation", label: "Evaluation" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased min-h-screen flex flex-col`}>
        <header className="border-b border-border/60 sticky top-0 z-40 bg-background/85 backdrop-blur">
          <nav className="mx-auto max-w-6xl px-5 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight text-base shrink-0">
              Verity
            </Link>
            <div className="flex items-center gap-1 overflow-x-auto">
              {NAV.slice(1).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-muted/60 whitespace-nowrap"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <a
              href="https://github.com/mayankgoel214/Verity"
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
            >
              Source
            </a>
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border/60 mt-16">
          <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground space-y-2">
            <p>
              Verity is a portfolio project, not legal advice. It reads documents and cites
              regulation text; it does not tell you whether you are compliant.
            </p>
            <p>
              Corpus assembled from public sources — US federal regulations are not subject to
              copyright, and the GDPR is published by the EU. SOC 2 and ISO/IEC 27001 are
              copyrighted and are deliberately absent.
            </p>
          </div>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}

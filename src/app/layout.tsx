import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { ThemeToggle } from "@/components/theme-toggle";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

// One serif, used only for the display headings. It is the single typographic
// decision that stops this reading as a default Tailwind page.
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-display",
});

// Citations and measurements are identifiers, not prose, and are set as such.
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
  ),
  title: {
    default: "Verity — compliance findings you can check",
    template: "%s — Verity",
  },
  description:
    "Retrieval over 413 sections of FERPA, HIPAA, GDPR, the Common Rule, Section 508 and export-control text. Every finding quotes the regulation behind it, and every quote is verified against the source before you see it.",
  openGraph: {
    title: "Verity",
    description:
      "A compliance assessment pipeline with a measured retrieval stack and verified citations.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

/**
 * Applied before first paint, so a visitor who chose light never sees a black
 * flash. It has to be inline and synchronous; anything deferred is too late.
 */
const NO_FLASH = `(function(){try{var t=localStorage.getItem('verity-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`;

const NAV = [
  { href: "/assess", short: "Assess", label: "Assess a document" },
  { href: "/search", short: "Search", label: "Retrieval playground" },
  { href: "/evaluation", short: "Eval", label: "Evaluation" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body
        className={`${inter.variable} ${display.variable} ${mono.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
          <nav className="mx-auto max-w-6xl px-5 h-14 flex items-center gap-4 sm:gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 shrink-0 group"
              aria-label="Verity home"
            >
              <span className="h-6 w-6 rounded-[7px] bg-accent grid place-items-center shrink-0">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden>
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    stroke="var(--accent-fg)"
                    strokeWidth="2.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="font-display text-[19px] tracking-tight">Verity</span>
            </Link>

            <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[13.5px] text-fg-muted hover:text-fg transition-colors px-2 sm:px-2.5 py-1.5 rounded-md hover:bg-surface-2 whitespace-nowrap"
                >
                  <span className="sm:hidden">{item.short}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1 shrink-0">
              <ThemeToggle />
              <a
                href="https://github.com/mayankgoel214/Verity"
                target="_blank"
                rel="noreferrer"
                className="text-[13.5px] text-fg-muted hover:text-fg transition-colors px-2 py-1.5 rounded-md hover:bg-surface-2"
              >
                Source
              </a>
            </div>
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line mt-20">
          <div className="mx-auto max-w-6xl px-5 py-10 grid gap-6 sm:grid-cols-2 text-[13px] text-fg-muted leading-relaxed">
            <p>
              Verity is a portfolio project, not legal advice. It reads documents and cites
              regulation text; it does not tell you whether you are compliant.
            </p>
            <p>
              Corpus assembled from public sources — US federal regulations are not subject to
              copyright, and the GDPR is published by the EU. SOC 2 and ISO/IEC 27001 are
              copyrighted and deliberately absent.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

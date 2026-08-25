import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthInitializer from "@/components/AuthInitializer/AuthInitializer";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter"
});

export const metadata: Metadata = {
  // Without metadataBase the generated og:image resolves relative and the
  // link-preview card comes out blank.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
  ),
  title: "ComplianceCopilot — read a data management plan like a regulator",
  description:
    "Reads project documents, works out which frameworks apply — FERPA, HIPAA, GDPR, the Common Rule, export control — and scores against each, quoting the passage behind every finding.",
  openGraph: {
    title: "ComplianceCopilot",
    description:
      "An agent pipeline that reads a data management plan, decides which regulations apply, and scores it against them with citations.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        <AuthInitializer />
        {children}
        <Toaster />
      </body>
    </html>
  );
}

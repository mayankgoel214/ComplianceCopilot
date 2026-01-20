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
  title: "Complai",
  description: "Enterprise-grade compliance management platform for Fortune 500 companies",
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

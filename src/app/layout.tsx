import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { BRAND } from "@/lib/brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", weight: ["500", "600", "700", "800"], display: "swap" });

const title = `${BRAND.name} — ${BRAND.descriptor}`;
const description = "An invitation-based AI-assisted interview experience. Complete your structured assessment and take the next step in your recruitment journey.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: title, template: `%s · ${BRAND.name}` },
  description,
  applicationName: BRAND.name,
  // Private, invitation-based product: keep it out of search indexes.
  robots: { index: false, follow: false },
  openGraph: { title, description: BRAND.tagline, siteName: BRAND.name, type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image", title, description: BRAND.tagline },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060B1D" },
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html> before React hydrates.
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

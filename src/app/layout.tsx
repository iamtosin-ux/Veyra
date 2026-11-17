import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/Toaster";
import { Tooltips } from "@/components/Tooltips";
import { ThemeWatcher } from "@/components/ThemeWatcher";
import { THEME_SCRIPT } from "@/lib/theme";

// Pajamas type: GitLab Sans for everything, headings included, and GitLab Mono for code.
// The variable names are the ones the app's styles already read.
const sans = localFont({
  variable: "--font-inter",
  src: [
    { path: "./fonts/GitLabSans.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/GitLabSans-Italic.woff2", weight: "100 900", style: "italic" },
  ],
});
const heading = localFont({ variable: "--font-heading-ui", src: [{ path: "./fonts/GitLabSans.woff2", weight: "100 900" }] });
const serif = Source_Serif_4({ variable: "--font-serif-ui", subsets: ["latin"] });
const mono = localFont({ variable: "--font-mono-source", src: [{ path: "./fonts/GitLabMono.woff2", weight: "100 900" }] });

export const metadata: Metadata = {
  title: "Veyra",
  description: "Multimodal evidence review workspace (prototype)",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme is set on <html> before hydration, so React is told not to expect it.
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${heading.variable} ${mono.variable} h-full antialiased`}>
      <head>
        <Script id="theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full bg-canvas text-ink">
        {children}
        <Toaster />
        <Tooltips />
        <ThemeWatcher />
      </body>
    </html>
  );
}

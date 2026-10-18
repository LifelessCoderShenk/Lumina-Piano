import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    default: "Lumina Piano — Made for your music",
    template: "%s | Lumina Piano",
  },
  description: site.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="fixed left-6 top-4 z-[100] -translate-y-24 rounded-full bg-primary px-5 py-3 text-sm text-background focus:translate-y-0"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

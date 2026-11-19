import type { Metadata } from "next";
import { Monitor } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { windowsPreview } from "@/lib/releases";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download the Lumina Piano Windows preview. Free trial with watermarked exports. macOS coming soon.",
};

export default function Download() {
  return (
    <PageIntro
      eyebrow="Download Lumina Piano"
      title={
        <>
          Lumina Piano.
          <br />
          Windows & macOS.
        </>
      }
      description="Free trial · Watermarked exports"
    >
      <div className="mt-14 grid max-w-3xl gap-4 sm:grid-cols-2">
        {["Windows", "macOS"].map((platform) => (
          <section
            key={platform}
            className="rounded-2xl border border-line bg-card p-8"
          >
            <Monitor
              size={26}
              strokeWidth={1.5}
              aria-hidden="true"
              className="mb-7 text-secondary"
            />
            <h2 className="text-xl font-medium">Lumina for {platform}</h2>
            {platform === "Windows" ? (
              <>
                <p className="mt-3 text-sm text-secondary">{windowsPreview.version} · 64-bit</p>
                <a href={windowsPreview.url} className="button button--primary mt-7">Download for Windows</a>
                <p className="mt-5 text-sm text-secondary">Unsigned preview. Windows may show a security warning.</p>
                <a href={windowsPreview.notes} className="mt-4 inline-block text-sm underline underline-offset-4">Release notes & checksum</a>
              </>
            ) : (
              <p className="mt-7 text-sm font-medium text-secondary">Coming soon</p>
            )}
          </section>
        ))}
      </div>
    </PageIntro>
  );
}

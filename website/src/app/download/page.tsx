import type { Metadata } from "next";
import { Monitor } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { previewFeedbackUrl, windowsPreview } from "@/lib/releases";

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
      <div className="mt-8 max-w-3xl text-secondary">
        <details className="rounded-2xl border border-line p-6">
          <summary className="cursor-pointer text-base font-medium text-primary">Getting started</summary>
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
            <li>Install and open Lumina Piano.</li>
            <li>Choose <strong className="text-primary">Trial · Sign in</strong> at the top-right. Use the same Google account as the website.</li>
            <li>Open a sample or add your MIDI, then export a short video. Trial exports include the Lumina watermark.</li>
          </ol>
        </details>
        <p className="mt-6 text-sm"><a href={previewFeedbackUrl} className="underline underline-offset-4">Report a problem</a><span className="ml-2">GitHub account required · Reports are public</span></p>
      </div>
    </PageIntro>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Monitor } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { macPreview, previewFeedbackUrl, windowsPreview } from "@/lib/releases";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Download Lumina Piano previews for Windows, Apple Silicon, and Intel Macs. Free trial with watermarked exports.",
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
      description="Free trial · No time limit · Watermarked exports"
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
              <>
                <p className="mt-3 text-sm text-secondary">macOS Preview 2</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <a href={macPreview.appleSilicon} className="button button--primary">Apple Silicon</a>
                  <a href={macPreview.intel} className="button button--secondary">Intel Mac</a>
                </div>
                <p className="mt-5 text-sm text-secondary">Not notarized. macOS may block opening this preview.</p>
                <a href={macPreview.notes} className="mt-4 inline-block text-sm underline underline-offset-4">Release notes & checksums</a>
              </>
            )}
          </section>
        ))}
      </div>
      <div className="mt-8 max-w-3xl text-secondary">
        <details className="rounded-2xl border border-line p-6">
          <summary className="cursor-pointer text-base font-medium text-primary">Getting started</summary>
          <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
            <li>Install and open Lumina Piano. On Mac, extract the ZIP and move the app to Applications.</li>
            <li>Choose <strong className="text-primary">Trial · Sign in</strong> at the top-right. Use the same Google account as the website.</li>
            <li>Open a sample or add your MIDI, then export a short video. Trial exports include the Lumina watermark.</li>
          </ol>
        </details>
        <p className="mt-6 text-sm"><a href={previewFeedbackUrl} className="underline underline-offset-4">Report a problem</a><span className="ml-2">GitHub account required · Reports are public</span></p>
        <Link href="/support" className="mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Installation & account help</Link>
      </div>
    </PageIntro>
  );
}

import type { Metadata } from "next";
import { Monitor } from "lucide-react";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Lumina Piano for Windows and macOS. Official downloads and installation details will be added here.",
};

export default function Download() {
  return (
    <PageIntro
      eyebrow="Download Lumina Piano"
      title={
        <>
          Your next performance
          <br />
          starts here.
        </>
      }
      description="Lumina Piano is built for Windows and macOS. Start with a free trial with watermarked exports."
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
            <p className="mt-4 text-sm leading-relaxed text-secondary">
              The official download and installation details will be added here.
            </p>
            <p className="mt-7 text-xs font-medium text-secondary">
              Download not yet available
            </p>
          </section>
        ))}
      </div>
    </PageIntro>
  );
}

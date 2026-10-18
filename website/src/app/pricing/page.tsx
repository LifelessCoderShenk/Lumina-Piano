import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start with a free trial with watermarked exports, then make a one-time purchase. Lumina Piano pricing will be announced.",
};

export default function Pricing() {
  return (
    <PageIntro
      eyebrow="Pricing"
      title={
        <>
          Try it first.
          <br />
          Make it yours.
        </>
      }
      description="Start with a free trial with watermarked exports. Then continue with a one-time purchase."
    >
      <div className="mt-14 max-w-2xl rounded-2xl border border-line bg-card p-8 sm:p-10">
        <h2 className="text-xl font-medium">
          One-time purchase. Price to be announced.
        </h2>
        <p className="mb-7 mt-4 leading-relaxed text-secondary">
          The final price and purchase details are still being decided.
        </p>
        <ButtonLink href="/download">Download Lumina Piano</ButtonLink>
      </div>
    </PageIntro>
  );
}

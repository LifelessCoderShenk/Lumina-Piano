import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { MediaPreview } from "@/components/home/media-preview";
import { homeMedia } from "@/lib/home-media";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore piano visualization, performance recording, MIDI editing, and sheet music in Lumina Piano.",
};

export default function Features() {
  return (
    <PageIntro
      eyebrow="Features"
      title={
        <>
          Create. Edit.
          <br />
          Make it yours.
        </>
      }
      description="From piano performance to video and sheet music."
    >
      <div className="mt-14 space-y-16">
        {[
          { media: homeMedia.edit, title: "Edit MIDI", href: "/showcase#note-correction", link: "Compare before & after", text: "Fix pitch, timing, length, and touch. Quantize or undo as you go." },
          { media: homeMedia.score, title: "Create sheet music", href: "/showcase#score-example", link: "View sample score", text: "Turn MIDI into notation. Refine the score and export a PDF." },
          { media: homeMedia.style, title: "Style your video", href: "/showcase#visual-styles", link: "Compare styles", text: "Colors, glow, particles, and MIDI-driven hands. Save your own presets." },
          { media: homeMedia.record, title: "Record a performance", href: "/showcase#workspace", link: "See the workflow", text: "Combine camera, MIDI, and audio—or import footage. Align the visuals to your piano." },
        ].map(({ media, title, text, href, link }) => (
          <section key={title} className="grid items-center gap-8 md:grid-cols-2">
            <MediaPreview media={media} />
            <div>
              <h2 className="text-2xl font-medium">{title}</h2>
              <p className="mt-4 leading-relaxed text-secondary">{text}</p>
              <Link href={href} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[#b4d2e7] underline decoration-white/25 underline-offset-4 hover:decoration-current">{link}<span aria-hidden="true" className="ml-2">â†’</span></Link>
            </div>
          </section>
        ))}
      </div>
    </PageIntro>
  );
}

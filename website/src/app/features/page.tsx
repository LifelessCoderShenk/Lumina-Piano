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
          More ways to make
          <br />
          your music yours.
        </>
      }
      description="Visualize your notes. Record a performance. Refine your playing without rerecording. Bring it all together in video or sheet music."
    >
      <div className="mt-14 space-y-16">
        {[
          { media: homeMedia.edit, title: "Refine the notes", href: "/showcase#note-correction", link: "Hear a note before and after correction", text: "Adjust pitch, timing, duration, and velocity. Quantize selected notes and undo edits while reviewing your performance." },
          { media: homeMedia.score, title: "Bring your playing onto the page", href: "/showcase#score-example", link: "Open a real score and its MIDI", text: "Generate sheet music from MIDI, review the notes, and export a printable PDF. Set the key, timing grid, and notation options in the same workspace." },
          { media: homeMedia.style, title: "Choose your visual style", href: "/showcase#visual-styles", link: "Compare two visual styles", text: "Set note colors, glow, and particles. Add generated hands that follow loaded MIDI, and save your look as a reusable preset." },
          { media: homeMedia.record, title: "Set up your performance", href: "/showcase#workspace", link: "Explore the recording workspace", text: "Choose camera, MIDI, and audio inputs, or import existing footage. Position the visualization and align it with your keyboard." },
        ].map(({ media, title, text, href, link }) => (
          <section key={title} className="grid items-center gap-8 md:grid-cols-2">
            <MediaPreview media={media} />
            <div>
              <h2 className="text-2xl font-medium">{title}</h2>
              <p className="mt-4 leading-relaxed text-secondary">{text}</p>
              <Link href={href} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[#b4d2e7] underline decoration-white/25 underline-offset-4 hover:decoration-current">{link}<span aria-hidden="true" className="ml-2">→</span></Link>
            </div>
          </section>
        ))}
      </div>
    </PageIntro>
  );
}

import { ScoreProof } from "@/components/home/score-proof";
import { CorrectionDemo } from "@/components/home/correction-demo";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { MediaPreview } from "@/components/home/media-preview";
import { homeMedia } from "@/lib/home-media";

export const metadata: Metadata = {
  title: "Showcase",
  description: "Watch real Lumina Piano visualizations and explore MIDI editing, sheet music, and recording tools.",
};

const looks = [
  { media: homeMedia.style, title: "Color and effects", description: "Give notes different colors and add crystal textures and floating particles." },
  { media: homeMedia.visualize, title: "A simpler look", description: "Use two contrasting colors to make the notes easier to follow." },
];
const workflows = [
  { media: homeMedia.edit, title: "Correct a wrong note", description: "Change a note’s pitch, timing, length, or volume without recording the whole performance again." },
  { media: homeMedia.score, title: "Create sheet music", description: "Turn notes from a MIDI file or keyboard recording into a score you can review." },
  { media: homeMedia.record, title: "Set up a recording", description: "Choose your keyboard, camera, and audio sources for a performance video." },
  { media: homeMedia.exportPanel, title: "Save your score", description: "Export your sheet music as a PDF to print or share." },
];

export default function Showcase() {
  return (
    <Container className="py-10 sm:py-14 lg:py-16">
      <header className="mb-8 flex flex-col gap-5 sm:mb-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-secondary">Showcase</p>
          <h1 className="text-4xl font-medium tracking-tight sm:text-5xl lg:text-6xl">See what you can make.</h1>
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-secondary">Watch the piano visuals, then explore the tools for recording, editing, and sheet music.</p>
      </header>

      <p className="mb-4 text-sm text-secondary">Recorded in Lumina Piano · Press play for piano audio</p>
      <section id="performance-demo" aria-labelledby="concert-title">
        <MediaPreview media={homeMedia.performance} shape="hero" />
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="concert-title" className="text-2xl font-medium tracking-tight">A complete phrase, from first note to last.</h2>
            <p className="mt-2 text-sm leading-relaxed text-secondary">An original eight-bar MIDI miniature played through Lumina’s piano engine. The sound and falling notes are captured together.</p>
          </div>
        </div>
      </section>

      <div id="visual-styles" className="mt-12 grid gap-10 md:grid-cols-2">
        {looks.map(({ media, title, description }) => (
          <section key={title} aria-label={title}>
            <MediaPreview media={media} />
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-medium tracking-tight">{title}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-secondary">{description}</p>
          </section>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-secondary">The two style studies above are silent captures from a separate sample MIDI. Expand any video to see the detail.</p>

      <CorrectionDemo />

      <ScoreProof />

      <section id="workspace" className="mt-16 border-t border-white/10 pt-10 sm:mt-20 sm:pt-12" aria-labelledby="workspace-title">
        <div className="mb-8">
          <h2 id="workspace-title" className="text-3xl font-medium tracking-tight">Record. Edit. Export.</h2>
          <p className="mt-3 text-base leading-relaxed text-secondary">A closer look at the tools inside Lumina Piano.</p>
        </div>
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          {workflows.map(({ media, title, description }) => (
            <section key={media.title}>
              <MediaPreview media={media} />
              <h3 className="mt-4 text-lg font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{description}</p>
            </section>
          ))}
        </div>
        <p className="mt-6 text-xs text-secondary">Actual app screenshots. Recording setup shown without connected camera hardware.</p>
      </section>
    </Container>
  );
}

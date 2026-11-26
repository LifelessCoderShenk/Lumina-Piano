import { ScoreProof } from "@/components/home/score-proof";
import { CorrectionDemo } from "@/components/home/correction-demo";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { MediaPreview } from "@/components/home/media-preview";
import { homeMedia } from "@/lib/home-media";
import { HandDemo } from "@/components/home/hand-demo";

export const metadata: Metadata = {
  title: "Showcase",
  description: "Watch real Lumina Piano visualizations and explore MIDI editing, sheet music, and recording tools.",
};

const looks = [
  { media: homeMedia.style, title: "Color and effects" },
  { media: homeMedia.visualize, title: "A simpler look" },
];


export default function Showcase() {
  return (
    <Container className="py-10 sm:py-14 lg:py-16">
      <header className="mb-8 flex flex-col gap-5 sm:mb-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-secondary">Showcase</p>
          <h1 className="text-4xl font-medium tracking-tight sm:text-5xl lg:text-6xl">See what you can make.</h1>
        </div>
      </header>
      <section id="performance-demo" aria-labelledby="concert-title">
        <MediaPreview media={homeMedia.hands} shape="hero" autoPlay />
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="concert-title" className="text-2xl font-medium tracking-tight">Chopin. In full flow.</h2>
            <a href="https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1693" className="mt-2 inline-block text-xs text-secondary underline underline-offset-4">Fantaisie-Impromptu, Op. 66 · Mutopia MIDI</a>
          </div>
        </div>
      </section>

      <HandDemo />

      <div id="visual-styles" className="mt-12 grid gap-10 md:grid-cols-2">
        {looks.map(({ media, title }) => (
          <section key={title} aria-label={title}>
            <MediaPreview media={media} />
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-medium tracking-tight">{title}</h2>
            </div>
          </section>
        ))}
      </div>

      <CorrectionDemo />

      <ScoreProof />

      <section id="workspace" className="mt-16 border-t border-white/10 pt-10 sm:mt-20 sm:pt-12" aria-labelledby="workspace-title">
        <div className="mb-6">
          <h2 id="workspace-title" className="text-3xl font-medium tracking-tight">From MIDI to finished video.</h2>
        </div>
        <MediaPreview media={homeMedia.workflow} shape="hero" />

      </section>
    </Container>
  );
}

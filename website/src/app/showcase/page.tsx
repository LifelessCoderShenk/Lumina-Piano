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
        <MediaPreview media={homeMedia.hands} shape="hero" />
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="concert-title" className="text-2xl font-medium tracking-tight">Generated hands. Real piano sound.</h2>
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
        <details className="mt-5 border-t border-white/10 pt-4 text-sm">
          <summary className="cursor-pointer py-2 font-medium">Read the walkthrough</summary>
          <ol className="mt-3 max-w-2xl list-decimal space-y-3 pl-5 leading-relaxed text-secondary">
            <li><strong className="text-primary">Import.</strong> Use Add MIDI to load the original eight-bar miniature.</li>
            <li><strong className="text-primary">Correct.</strong> Select the first melody note, deliberately changed to F5 for this example, and move it down to E5. The rest of the piece stays intact.</li>
            <li><strong className="text-primary">Style.</strong> Start with Clean Studio, enable generated hands, and choose 16:9 at 1080p and 30 fps.</li>
            <li><strong className="text-primary">Export.</strong> Keep Include Audio enabled and render the video. The final segment plays the resulting file.</li>
          </ol>
        </details>
      </section>
    </Container>
  );
}

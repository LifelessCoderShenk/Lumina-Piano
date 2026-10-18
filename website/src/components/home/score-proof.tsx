import Image from "next/image";
import { Download, ArrowUpRight } from "lucide-react";

export function ScoreProof() {
  return (
    <section id="score-example" aria-labelledby="score-example-title" className="border-t border-white/10 py-12 sm:py-16">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-secondary">From the same performance</p>
          <h2 id="score-example-title" className="text-3xl font-medium tracking-tight sm:text-4xl">Hear it. See it. Read it.</h2>
          <p className="mt-4 text-base leading-relaxed text-secondary">The piano miniature at the top of this page also becomes sheet music. This is the actual output from Lumina’s score renderer, using the same eight-bar MIDI piece.</p>
          <p className="mt-4 text-sm leading-relaxed text-secondary">Open the complete score to inspect all eight bars, or download the MIDI to explore the notes in your own music software.</p>
          <div className="mt-6 flex flex-wrap gap-4">
            <a href="/media/lumina-miniature-score.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Open printable score <ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
            <a href="/media/lumina-miniature.mid" download className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-primary hover:border-white/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><Download size={16} aria-hidden="true" />Download sample MIDI</a>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-secondary">Original demo composition · 80 BPM · C major · 4/4<br />The score opens as a print-ready webpage. Use your browser’s Print command to print it or save a PDF.</p>
        </div>
        <figure>
          <a href="/media/lumina-miniature-score.html" target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-white/15 bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" aria-label="Inspect the full generated score (opens in a new tab)">
            <Image src="/media/lumina-miniature-score-preview.png" alt="The opening six bars of the original piano miniature, engraved by Lumina on treble and bass staves." width={1265} height={720} sizes="(max-width: 1024px) 100vw, 580px" className="h-auto w-full" />
          </a>
          <figcaption className="mt-3 text-xs leading-relaxed text-secondary">Preview of the opening six bars. The complete score includes all eight.</figcaption>
        </figure>
      </div>
    </section>
  );
}

import Image from "next/image";
import { Download, ArrowUpRight } from "lucide-react";

export function ScoreProof() {
  return (
    <section id="score-example" aria-labelledby="score-example-title" className="border-t border-white/10 py-12 sm:py-16">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <h2 id="score-example-title" className="text-3xl font-medium tracking-tight sm:text-4xl">Hear it. See it. Read it.</h2>
          <p className="mt-4 text-secondary">Your performance, turned into sheet music.</p>
          <div className="mt-6 flex flex-wrap gap-4">
            <a href="/media/lumina-miniature-score.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Open printable score <ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
            <a href="/media/lumina-miniature.mid" download className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-primary hover:border-white/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><Download size={16} aria-hidden="true" />Download sample MIDI</a>
          </div>
        </div>
        <figure>
          <a href="/media/lumina-miniature-score.html" target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-white/15 bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" aria-label="Inspect the full generated score (opens in a new tab)">
            <Image src="/media/lumina-miniature-score-preview.png" alt="The opening six bars of the original piano miniature, engraved by Lumina on treble and bass staves." width={1265} height={720} sizes="(max-width: 1024px) 100vw, 580px" className="h-auto w-full" />
          </a>
        </figure>
      </div>
    </section>
  );
}

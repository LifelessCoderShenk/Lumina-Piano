"use client";

import { useState } from "react";
import Image from "next/image";

export function CorrectionDemo() {
  const [corrected, setCorrected] = useState(false);
  const stage = corrected ? "after" : "before";
  return (
    <section id="note-correction" aria-labelledby="correction-heading" className="py-12 sm:py-16">
      <h2 id="correction-heading" className="text-3xl font-medium tracking-tight sm:text-4xl">One wrong note. No second take.</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary">Fix a note without recording again.</p>
      <div className="my-6 flex flex-wrap gap-3" role="group" aria-label="Compare the note correction">
        {[false, true].map(value => (
          <button key={String(value)} type="button" aria-pressed={corrected === value} onClick={() => setCorrected(value)} className={`rounded-full border px-5 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${corrected === value ? "border-white bg-white text-black" : "border-white/20 text-primary hover:border-white/50"}`}>
            {value ? "After: corrected E5" : "Before: wrong F5"}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-black">
        <Image src={`/media/correction-${stage}.png`} alt={`Actual Lumina editor: the selected third note is ${corrected ? "E5 after correction" : "F5 before correction"}.`} width={1280} height={350} sizes="(max-width: 700px) 760px, 1056px" className="h-auto min-w-[760px] w-full" />
      </div>
      <p className="mt-2 text-xs text-secondary md:hidden">Scroll the editor sideways to inspect the phrase.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="text-sm text-secondary">{corrected ? "The third note now matches the intended melody." : "Listen for the third note, about 1.5 seconds in."}</p>
        <audio key={stage} controls preload="none" aria-label={`Listen to the ${corrected ? "corrected" : "original"} phrase`} className="w-full sm:w-80"><source src={`/media/correction-${stage}.mp3`} type="audio/mpeg" /></audio>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-secondary">Staged example · Edited in Lumina Piano</p>
    </section>
  );
}

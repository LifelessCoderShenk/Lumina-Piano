"use client";

import { useState } from "react";

export function HandDemo() {
  const [open, setOpen] = useState(false);
  return (
    <section id="hand-demo" aria-labelledby="hand-demo-title" className="mt-12 border-t border-white/10 pt-10">
      <h2 id="hand-demo-title" className="text-2xl font-medium tracking-tight">Try the new generated hands.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
        Silent preview · Experimental
      </p>
      {open ? (
        <>
          <iframe src="/demos/hands/index.html" title="Interactive Lumina Piano hand motion and MIDI preview" className="mt-6 h-[1050px] w-full rounded-xl border border-white/10 bg-[#101115] sm:h-[820px]" />
          <button onClick={() => setOpen(false)} className="mt-4 rounded-full border border-white/20 px-5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-4">Close preview</button>
        </>
      ) : (
        <button onClick={() => setOpen(true)} className="mt-5 rounded-full bg-white px-6 py-3 text-sm font-medium text-black focus-visible:outline-2 focus-visible:outline-offset-4">Open interactive preview</button>
      )}
      <a href="/demos/hands/index.html" className="ml-4 inline-block py-3 text-sm text-secondary underline underline-offset-4">Open full screen</a>
    </section>
  );
}

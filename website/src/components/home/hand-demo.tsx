"use client";

import { useState } from "react";

export function HandDemo() {
  const [open, setOpen] = useState(false);
  return (
    <section id="hand-demo" aria-labelledby="hand-demo-title" className="mt-12 border-t border-white/10 pt-10">
      <h2 id="hand-demo-title" className="text-2xl font-medium tracking-tight">Try generated hands.</h2>
      {open ? (
        <>
          <iframe src="/demos/hands/index.html?v=clean-2" title="Interactive Lumina Piano hands" className="mt-6 h-[620px] w-full rounded-xl border border-white/10 bg-[#0b0b0d] sm:h-[640px]" />
          <button onClick={() => setOpen(false)} className="mt-4 rounded-full border border-white/20 px-5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-4">Close preview</button>
        </>
      ) : (
        <button onClick={() => setOpen(true)} className="mt-5 rounded-full bg-white px-6 py-3 text-sm font-medium text-black focus-visible:outline-2 focus-visible:outline-offset-4">Try demo</button>
      )}
      <a href="/demos/hands/index.html" className="ml-4 inline-block py-3 text-sm text-secondary underline underline-offset-4">Full screen</a>
    </section>
  );
}

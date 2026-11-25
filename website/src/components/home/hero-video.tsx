"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { homeMedia } from "@/lib/home-media";

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (preference.matches) ref.current?.pause();
      else void ref.current?.play().catch(() => {});
    };
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  return <>
    <video ref={ref} muted loop playsInline preload="metadata"
      poster={homeMedia.hero.asset.poster}
      aria-label={homeMedia.hero.asset.alt}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
      <source src={homeMedia.hero.asset.src} type="video/mp4" />
    </video>
    <button type="button" aria-label={playing ? "Pause hero video" : "Play hero video"}
      onClick={() => { if (playing) ref.current?.pause(); else void ref.current?.play().catch(() => {}); }}>
      {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
    </button>
  </>;
}

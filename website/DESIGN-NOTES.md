# Homepage redesign

## Reference inspection

Inspected https://www.seemusicapp.com/ and https://synthesiagame.com/ in the browser at desktop size and a 390px mobile viewport.

SeeMusic leads with a clear piano-video use case, a prominent visualization with real hands, and a download action. A short workflow leads to a video gallery; alternating media and copy explain editing, notation, visual customization, and recording. Images carry the story rather than decorative cards. Its blue accents and visual assets were not copied.

Synthesia uses a compact brand/navigation area, plain-language benefit descriptions, conspicuous trial/purchase actions, and an adjacent embedded product video. The video frame was present but its content did not load during inspection, so playback was not assessed. Feature blocks make the product's purpose understandable without reading long marketing copy.

Both sites showed horizontal clipping at the narrow viewport in this browser session. Lumina instead stacks the hero, story rows, and gallery, and uses an accessible navigation disclosure. Do not treat the observed clipping as a claim about every mobile device.

The former Lumina homepage was a Phase 1 placeholder: a large headline, supporting copy, and no substantive media or feature content. The redesign replaces that structure with a concise hero above a large cinematic preview (16:9 on mobile), three alternating capability stories, six feature previews, a four-step workflow, a two-slot gallery, and a final download CTA. Restrained blue/amber note colors give the music a visual presence without adding neon effects or abstract gradients.

## Authentic media replacement

No approved screenshots or performance videos were found in the inspected source folders. Every current image is an original schematic SVG illustration, visibly labeled **Temporary illustration**. These are neither actual app screenshots nor recordings. Gallery titles describe planned examples, not published performances. The hero's Animate illustration control animates the drawing only; it produces no audio and does not demonstrate the desktop app.

1. Put approved screenshots, MP4 video, posters, and captions in `website/public/media/`. Use 16:9 captures, ideally 1920×1080. Keep the real application interface visible when demonstrating editing or notation. Only use performances you have permission to publish.
2. Edit `src/lib/home-media.ts`. Each media entry accepts an optional `asset`:

```ts
asset: {
  type: "image",
  src: "/media/midi-editor.webp",
  alt: "Describe the actual MIDI editing view shown in this capture",
}
```

Or supply a video with a real poster:

```ts
asset: {
  type: "video",
  src: "/media/performance.mp4",
  poster: "/media/performance-poster.webp",
  alt: "Describe this specific Lumina performance",
  captions: "/media/performance.en.vtt", // required for spoken content
}
```

These paths are examples only; they are not currently configured or requested by the site. The component automatically replaces the illustration and removes its temporary label when an asset exists. Videos use native accessible controls, preload no video data, and do not autoplay.

3. Replace each gallery title with its real performance title. Update the gallery's coming-soon text in `src/app/page.tsx` when approved recordings are published. Keep it for any unfilled slots.
4. Review desktop and mobile layouts and run `npm run lint` and `npm run build`.

Suggested captures: falling-note performance (hero), MIDI correction (edit), MIDI/camera/audio recording (record), grand-staff notation (score), two real visual styles (style), and a finished video export (export).

No download binaries, pricing, checkout, licensing, third-party embeds, or external tracking were added.

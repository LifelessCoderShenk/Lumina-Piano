# Lumina Piano: reference reconstruction

## Evidence and method

Inspected SeeMusic (https://www.seemusicapp.com/) and Synthesia (https://synthesiagame.com/) visually in the browser, including scrolled screenshots of the lower sections. Desktop comparison: **1280 × 900**. Mobile-width comparison: **390 × 844**. Full-page and viewport captures are saved in `.qa/reference-study/`.

The first reconstruction used temporary headline and feature copy. Its full-page screenshot is `reconstruction-desktop.jpg`. The final content replacement is isolated in `src/lib/reference-content.ts`; no new sections were introduced in that step.

Both reference pages clipped horizontally at 390px in this desktop browser's narrow viewport. This is a viewport test, not a claim about a physical phone or mobile user-agent behavior. Lumina retains the sequence but stacks the columns, wraps the benefit strip, and uses a navigation disclosure. Synthesia's embedded video poster loaded during this inspection; video playback itself was not tested.

## SeeMusic section-by-section breakdown

Desktop content sits in an approximately **980px centered column**. Its hero uses about **470px for text / 490px for imagery**, with a 44px headline, 17px supporting copy, and a broad download button below the description. Feature headings range from 34–40px. The background alternates black and near-black, without a separate card around every feature.

| Order / section | Observed visual structure and purpose | Lumina adaptation |
| --- | --- | --- |
| 1. Header | About 176px tall; large wordmark in the upper row, language/social controls right; a second row distributes links and Download. Establishes brand and direct navigation. | Homepage-only two-row header at 176px desktop height. Lumina wordmark; Windows/macOS label replaces unavailable social/language controls. Existing routes retained. |
| 2. Hero | Badge, two-column composition, headline and short paragraph left; image right around 490×410px. Large download action and platform row below the copy. | Same split and approximate visual footprint, 44px headline, factual Lumina copy, white download action, visibly labeled illustration. |
| 3. Capability strip | Shallow bordered row with five check-marked functions, spanning the content width beneath the hero. | Five known capabilities, same horizontal strip; wraps on mobile. |
| 4. Three-step overview | Roughly 400px section; three compact sequential blocks left, device illustration right. Describes input → customization → output. | Three compact steps and a desktop-media placeholder. No additional marketing timeline. |
| 5. Video gallery | Dark band; 30px heading and introduction, then three landscape thumbnails with titles beneath. Appears before detailed features. | Three noninteractive, clearly labeled video placeholders in the same early position. No fictional creators or play actions. |
| 6. Video creation | Square-ish visualization left, heading/lead/three bullets right; about 450–530px tall. Shows overall output. | Performance-video explanation with the same image/text ratio and bullet density. |
| 7. Recording/import | Text left, visual right; similar height. Explains input sources. | MIDI keyboard recording, MIDI files, MusicXML. |
| 8. Note editing | Large editing screenshot left, concise copy right. Explains corrections. | MIDI editing illustration and three concrete capabilities. |
| 9. Testimonial | Short full-width quote strip with stars and attribution. Adds social proof. | Omitted: no verified Lumina testimonial. No substitute section added. |
| 10. Notation | Text left, score/performance image right. Shows sheet-music support. | MIDI-to-notation, correction, PDF export. |
| 11. Visual design | Large settings screenshot left, copy right. Shows customization. | Colors, glow/particles/lighting, backgrounds and saved presets. |
| 12. Camera footage | Copy left, performance imagery right. Shows compositing. | Camera recording/import, positioning, microphone/piano audio. |
| 13. Tutorial | Dark band; embedded landscape video and caption left, instructional bullets and links right. Gives a walkthrough. | Static walkthrough placeholder, four short bullets, existing Features/Showcase links. |
| 14. Platform downloads | Centered headline, short offer line, horizontal platform buttons; roughly 300px tall. Converts interest to download. | Windows and macOS actions link to the existing download-information route. Explicitly states installers are not yet available. |
| 15. Comparison | Centered heading and paragraph, narrower three-column table. Clarifies product differences. | Trial/license comparison using only supplied commercial facts. No competitor claims, invented price, or checkout. |
| 16. FAQ | Centered title, short introduction, broad accordion rows with the first open. Resolves practical questions. | Six factual questions using native keyboard-accessible details/summary elements. |
| 17. Footer | Brand and product description above navigation/legal/social links. | Existing Lumina footer retained to avoid unrelated shared-layout work. No fabricated legal/social destinations. |

## Synthesia section-by-section breakdown

Unlike SeeMusic, Synthesia is a compact two-column software page rather than a long series of full-width marketing sections. Desktop content is roughly 930px wide: about 420px left and 475px right, with a narrow gutter. Its blue header/hero transitions to a light body; Lumina retains its own dark colors.

| Section / placement | Observed structure and purpose | What transfers to Lumina |
| --- | --- | --- |
| Header | Large wordmark left, four simple links right in one horizontal row. | Clear navigation labels and restrained controls; SeeMusic remains the primary header structure. |
| Introduction, left column | Modest two-line headline, short explanation, adjacent trial/purchase buttons. Compact rather than expansive. | Literal product explanation and visible trial/license facts. Do not copy the price or purchase flow. |
| Product video, upper right | Roughly 475×357px embed beside the introductory copy, extending below its band. Immediately demonstrates software. | Keep the main demonstration beside the copy; reserve a real video slot instead of inventing app UI. |
| Feature stack, lower left | Seven small image-and-description rows: playback pacing, notation, hand practice, song support, progress, fingering, lighted keyboards. Each gives one understandable benefit. | Brief, specific explanations in Lumina's reference rows. Synthesia's learning features are not claimed for Lumina. |
| Release news, lower right | Three chronological articles beneath the video, with compact colored title bars and dense update text. | Omitted: not part of the selected SeeMusic sequence and no corresponding Lumina release-news content provided. |
| Footer | Small copyright/social/legal row below the feature stack, not a large separate band. | Keep the footer simple; no invented destinations. |
| Mobile-width behavior | Both columns remained wide and were clipped at 390px in this inspection. | Do not reproduce clipping. Stack the selected structure while preserving content order. |

## Visual comparison and intentional differences

- Preserved the approximately 980px desktop width, 176px header, two equal hero columns, 44px headline, 17px descriptions, early three-thumbnail gallery, and alternating square media/copy feature sequence.
- The initial reconstruction measured: hero 635px; overview 443px; gallery 548px; feature rows 536px each; tutorial 480px; downloads 319px. The initial feature/gallery dimensions were then checked against the reference captures before finishing.
- Reference heading positions: hero about y=282, overview y=858, gallery y=1257, first feature y=1780. These are comparison anchors, not a pixel-perfect copying target.
- The testimonial is deliberately absent. The comparison table is shorter because only three trial/license distinctions are established; filler rows would imply unsupported facts.
- Lumina keeps Inter, dark brand colors, white primary download buttons, and original labeled schematic illustrations. No reference logos, text, images, or source code are used in the website.
- Desktop section order is maintained on mobile. Unlike the clipped reference captures, all Lumina content fits the viewport.

## Files and media replacement

- `src/app/page.tsx` and `home.module.css`: reconstructed homepage structure and responsive proportions.
- `src/lib/reference-content.ts`: factual hero/feature copy.
- `src/components/home/reference-header.*`: homepage masthead. `site-header.tsx` selects it only on `/`.
- `src/components/home/media-preview.*`: static, labeled placeholders or real supplied media; unnecessary animation removed.
- `src/lib/home-media.ts`: add approved `asset` entries here. Supported image assets specify `type`, `src`, and `alt`; MP4 assets specify `type`, `src`, `poster`, `alt`, and optional spoken-content captions. Files belong in `website/public/media/`. No nonexistent asset URLs are configured.

Other page routes, dependencies, download backend, checkout, and licensing implementation are unchanged.

## Screenshot index

All files below are in `.qa/reference-study/`:

- `seemusic-desktop-hero.jpg`, `seemusic-desktop.jpg`
- `synthesia-desktop-hero.jpg`, `synthesia-desktop.jpg`
- `seemusic-mobile-hero.jpg`, `seemusic-mobile.jpg`
- `synthesia-mobile-hero.jpg`, `synthesia-mobile.jpg`
- `before-desktop-hero.jpg`, `before-desktop.jpg`, `before-mobile.jpg`
- `reconstruction-desktop.jpg`: temporary structure before final hero/feature copy
- `after-desktop-hero.jpg`, `after-desktop.jpg`, `after-mobile-hero.jpg`, `after-mobile.jpg`

Screenshots of third-party sites are research evidence only, not assets shipped with the homepage.

## Final verification

- Production build, ESLint (zero warnings), and TypeScript checks passed.
- All five routes rendered successfully in the production browser preview.
- Mobile navigation opened, Escape closed it and restored focus, and Enter toggled the native FAQ disclosure. No browser warnings or errors were recorded during homepage checks.
- At 390px, document width was exactly 390px: no horizontal overflow.
- Final desktop measurements: hero begins at y=176 and is 635px tall; overview begins at y=811 and is 443px; gallery begins at y=1254 and is 548px; first feature begins at y=1802 and is 536px. These maintain the reference's early-gallery placement and media-heavy feature sequence.
- Full desktop height is 7315px versus SeeMusic's 7658px in these captures. The shorter licensed-trial table and omitted testimonial account for intentional content differences. The illustrations are less visually detailed than real product media and should be replaced with approved captures.
- See `.qa/reference-study/comparison.html` for desktop, mobile, and before/after screenshots together. No dependencies or backend functionality were added.

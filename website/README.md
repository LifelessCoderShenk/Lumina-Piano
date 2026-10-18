# Lumina Piano website

Foundation plus the reference-based homepage reconstruction. See REFERENCE-STUDY.md for the current section-by-section findings, layout decisions, screenshots, and media replacement instructions. DESIGN-NOTES.md records the superseded first redesign. This is an independent Next.js App Router project; all website source, dependencies, and build output stay inside `website`.

## Local development

Requires Node.js 20.9 or newer and npm.

```powershell
cd C:\Users\Shashank\Documents\claude\website
npm ci
npm run dev
```

Open http://localhost:3000. Stop with Ctrl+C.

```powershell
npm run lint
npm run typecheck
npm run build -- --webpack
npm start
```

## Structure

- `src/app`: shared layout, Tailwind theme, and five routes.
- `src/components`: shared navigation, footer, brand, and page introductions.
- `src/components/ui`: buttons, links, headings, containers, and product media frames.
- `src/lib/site.ts`: shared site information and navigation.

## Design system

Theme tokens live in `src/app/globals.css`: background `#0B0B0D`, cards `#17171B`, primary text `#F5F5F7`, secondary text `#A1A1AA`. Inter is bundled locally through Fontsource, so builds and visitors do not need Google Fonts. Shared route containers cap at 1152px; the reference-based homepage uses 980px. Typography scales for mobile and controls have visible keyboard focus. The homepage navigation collapses at 700px; other routes at 768px. The mobile menu is a non-modal disclosure: Tab navigates links and Escape closes it and returns focus. Reduced-motion preferences disable animation.

## Scope

The website includes a reference-based homepage, Features, Showcase, Pricing, and Download routes. The Showcase contains actual renderer videos, a complete original MIDI miniature with piano audio, an interactive note-correction example with before/after audio, and a printable score plus its downloadable source MIDI. Capture provenance and reproduction helpers are in `capture/README.md`.

The score is a print-ready HTML export from the app's score renderer; visitors can print or save a PDF through their browser. The correction example uses actual editor screenshots, not a continuous screen recording. Camera performance footage and a continuous sheet-music/export walkthrough remain outstanding.

Pricing and official installers are not yet available. No checkout, licensing backend, or fabricated download destinations are implemented.

Everything outside this directory is read-only reference material. Do not run installation or build commands from the parent desktop-app directory.

## Phase 1 verification

- Production build: passed; all five routes statically prerendered.
- ESLint: passed with zero warnings.
- TypeScript: passed.
- Browser: all routes navigated successfully; no console errors observed. Desktop, 768px tablet, 375px and 320px mobile layouts checked. Mobile disclosure, link selection, and Escape focus restoration verified.
- Production dependency audit: zero vulnerabilities. Full audit reports five high-severity findings in the development-only `eslint-config-next` → `fast-glob` → `micromatch` → `braces` chain (GHSA-vfj7-8cjw-p6xm). npm's proposed remedy downgrades the Next lint configuration across major versions; it was not applied. Revisit when upstream publishes a compatible fix.
- This environment required elevated execution for npm network access and the Windows Next.js compiler. Normal local npm commands are listed above.

## Created file inventory

```text
.gitignore
README.md
package.json
package-lock.json
tsconfig.json
next-env.d.ts
next.config.ts
postcss.config.mjs
eslint.config.mjs
src/app/globals.css
src/app/layout.tsx
src/app/page.tsx
src/app/features/page.tsx
src/app/showcase/page.tsx
src/app/pricing/page.tsx
src/app/download/page.tsx
src/components/brand.tsx
src/components/page-intro.tsx
src/components/site-header.tsx
src/components/site-footer.tsx
src/components/ui/button.tsx
src/components/ui/container.tsx
src/components/ui/heading.tsx
src/components/ui/product-frame.tsx
src/lib/site.ts
```

Ignored local folders contain installed dependencies (`node_modules`), npm cache (`.npm-cache`), and generated builds (`.next`).


## Build note
Use the webpack build command above on this Windows environment. Development uses the standard Next.js dev server. Generated output, dependencies, environment files, and local QA scratch files are excluded from Git.

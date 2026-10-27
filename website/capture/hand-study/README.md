# Hand motion study — isolated prototype

## MIDI import (2026-10-26)

Use **Open MIDI** to load a local `.mid` or `.midi`, or **Load full Lumina MIDI**
to test the complete bundled 89-note performance. Choose Automatic hands or
Split by pitch before loading; the split value is a MIDI note number (60 = C4).
Imported performances retain all notes, note-off times and tempo changes, with
a one-second lead-in and a 0.75-second ending. The timeline covers their full
duration. Playback is silent and file contents never leave the browser.

Planning runs in a cancellable worker. Failed or cancelled imports preserve the
previous preview; choosing a newer file invalidates any older pending read or
worker result. Empty, malformed, unplayable and out-of-range files report errors
rather than dropping notes. Current preview limits: 10 MB, 4,000 notes,
30 minutes and the 88-key piano range A0–C8. This targets piano arrangements,
not arbitrary orchestral MIDI. Finger collisions/reach remain experimental.

Motion poses are solved on demand with a bounded 64-pose cache per hand rather
than solving a whole song before playback. An unused hand is hidden. This is
still the isolated study, not a replacement for the production renderer.

Validation: local browser file-picker import of the full 89-note MIDI; full
timeline and late-performance scrubbing; 1,803-frame original motion regression;
parser checks for tempo changes, one-hand files, invalid/empty/out-of-range/dense
input and finger occupancy; ESLint; standalone Vite build including its worker.
Vite reports the existing large Three.js bundle warning.

```powershell
node node_modules/esbuild/bin/esbuild website/capture/hand-study/check-midi-import.ts --bundle --platform=node --format=esm --outfile=.tmp/check-midi-import.mjs
node .tmp/check-midi-import.mjs
```

## Earlier study stages

Run from the repository root:

```powershell
npx vite --config website/capture/vite.config.mjs --host 127.0.0.1 --port 5176 --strictPort
```

Open http://127.0.0.1:5176/website/capture/hand-study/index.html.
The default mode now plays both hands on the first six seconds of the existing
original `website/public/media/lumina-miniature.mid`. Playback is silent.
The second performance mode transposes the same notes up two semitones to
exercise black-key reach. Gold highlights identify left-hand notes, blue right.
Playback is silent, starts paused, and stops at the end of the selected exercise. Select scales,
chords or thumb crossings, scrub the timeline, change viewing angle, and enable
contact targets. **Check all exercises** samples held fingertip contact errors
at 60 samples per second. It is a diagnostic, not a realism certification.

## Model provenance

- Source: https://github.com/immersive-web/webxr-input-profiles/tree/main/packages/assets/profiles/generic-hand
- Download: https://raw.githubusercontent.com/immersive-web/webxr-input-profiles/main/packages/assets/profiles/generic-hand/right.glb
- Retrieved: 2026-10-24; original binary retained unchanged.
- SHA256: `291790c14f7f88a7f9bd35330c47392ed8e8d395ae6728f4bb7089f1bc1f2b96`
- MIT license, Copyright (c) 2019 Amazon. Full upstream license: [LICENSE.md](LICENSE.md).

The source skeleton provides sibling WebXR joints. The viewer reparents them
into finger chains while preserving their bind transforms. Joint rotations are
bounded, bone lengths remain fixed, and fingertip IK is coupled to a bounded
wrist translation around a phrase path. The thumb has separate opposition and
flexion axes. Chords use one averaged wrist destination. Wrist travel waits
until near release rather than dragging a held fingertip across the keyboard.

## Current limitations and validation

This is a generic hand asset with authored motion, not pianist motion capture.
It is deliberately not integrated with the app renderer or Showcase videos.
It covers the original three right-hand exercises and a fixed two-hand MIDI excerpt.
There is no forearm, finger collision solver, key depression, or learned
fingering. Joint bounds are prototype parameters, not a validated anatomical
model. Smooth contacts do not guarantee natural poses or velocity.

The thumb now uses a lowered rest target beside the palm. Exercise poses are
solved once and cached. Playback interpolates those poses with eased wrist
translations and quaternion interpolation; held fingers receive contact
correction during the 50 ms anticipation/release windows. Scrubbing produces
the same pose as forward playback, without an accumulated simulation state.

Regression sweep on 2026-10-24 at 60 Hz, maximum held-contact error:

| Exercise | Maximum | Time |
| --- | ---: | ---: |
| Scale | 1.4 mm | 3.30 s |
| Chords | 1.0 mm | 8.30 s |
| Thumb crossing | 2.1 mm | 1.67 s |

Run `node website/capture/hand-study/check-motion.mjs` from the repository root.
The regression check covers 1,803 frames, bounds held contact error below 3 mm,
bounds wrist travel below 8 mm per 60 Hz frame, verifies bone offsets remain
fixed, checks finite poses, tests out-of-order scrubbing, and checks that the
resting thumb stays below the wrist and beside the palm. These tolerances cover
these three exercises only; they do not certify arbitrary MIDI or realism.

Production integration still requires general MIDI phrase planning,
collision handling and visual review of a wider repertoire. No Showcase video
was replaced by this isolated study.

Checks: ESLint for study.js and the motion modules; standalone Vite production build (esnext target).
The build bundles the GLB and warns about the Three.js bundle exceeding 500 kB.
No dependency was added.

## Two-hand MIDI study (2026-10-25)

`midi-performance.ts` uses the app's MIDI parser, tempo map and fingering planner
as a seed. The excerpt's non-overlapping bass/melody registers define the hands;
the parser merges source tracks sharing a channel, so track index is not used.
A bounded beam search refines finger choices for this mesh, reserving held
fingers and penalizing wrist travel and incompatible simultaneous reach.
No MIDI note is dropped, shortened or delayed: 16 accompaniment and 8 melody
notes retain their original timing, with a one-second lead-in.

The left hand mirrors the licensed right-hand asset in a dedicated group. Its
solver uses reflected key coordinates, then the group is reflected for display.
The regression check verifies the actual reflected fingertip coordinates.
Pose anchors include note-on and note-off boundaries, preserving overlapping
notes rather than treating each onset as an isolated gesture.

Measured maximum contact error over 60 Hz playback:

| Version | Left | Right |
| --- | ---: | ---: |
| Original excerpt | 8.45 mm | 0.002 mm |
| Transposed +2 | 10.46 mm | 0.135 mm |

The wider left-hand changes are still outside the original exercise's 3 mm
target. This exposes a remaining reach/pose-planning limitation; it is not a
production-quality gate passing. Finger collisions and forearms are not yet
implemented, and the Showcase renderer remains unchanged.

Run the MIDI checks from the repository root (uses existing esbuild):

```powershell
node node_modules/esbuild/bin/esbuild website/capture/hand-study/check-performance.ts --bundle --platform=node --format=esm --external:three --external:three/* --outfile=.tmp/check-performance.mjs
node .tmp/check-performance.mjs
```

These checks verify note count, non-conflicting finger occupancy, finite poses
and left/right reflection, and report contact error and maximum wrist step.

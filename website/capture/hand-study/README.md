# Hand motion study — isolated prototype

Run from the repository root:

```powershell
npx vite --config website/capture/vite.config.mjs --host 127.0.0.1 --port 5176 --strictPort
```

Open http://127.0.0.1:5176/website/capture/hand-study/index.html.
Playback is silent, starts paused, and stops at ten seconds. Select scales,
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
It currently covers one right hand and three fixed white-key exercises.
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

Production integration still requires general MIDI phrase planning, both hands,
collision handling and visual review of a wider repertoire. No Showcase video
was replaced by this isolated study.

Checks: ESLint for study.js and the motion modules; standalone Vite production build (esnext target).
The build bundles the GLB and warns about the Three.js bundle exceeding 500 kB.
No dependency was added.

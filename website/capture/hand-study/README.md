# Hand motion study — isolated prototype

Run from the repository root:

```powershell
npx vite --config website/capture/vite.config.mjs --host 127.0.0.1 --port 5176 --strictPort
```

Open http://127.0.0.1:5176/website/capture/hand-study/index.html.
Playback is silent, starts paused, and stops at ten seconds. Select scales,
chords or thumb crossings, scrub the timeline, change viewing angle, and enable
contact targets. **Check all exercises** samples held fingertip contact errors
every 0.1 seconds. It is a diagnostic, not a realism certification.

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

Browser sweep on 2026-10-24, maximum held-contact error:

| Exercise | Maximum | Time |
| --- | ---: | ---: |
| Scale | 2.2 mm | 4.1 s |
| Chords | 7.8 mm | 1.0 s |
| Thumb crossing | 3.2 mm | 4.1 s |

Chord fit, thumb posture, non-playing finger posture, and wrist velocity need
further work before production integration. The 0.1-second sample interval can
miss short transients; visually review slow playback and contact boundaries.

Checks: ESLint for study.js; standalone Vite production build (esnext target).
The build bundles the GLB and warns about the Three.js bundle exceeding 500 kB.
No dependency was added.

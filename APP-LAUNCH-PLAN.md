# Lumina Piano: app readiness plan

Scope: finish the app experience before distribution, signing, licensing, pricing, or checkout. No new major features. Preserve existing editing and recording capabilities.

## 1. Workflow reliability
- Run the complete app test suite and record failures before changing behavior.
- Exercise import -> playback -> edit -> save -> reopen -> export using a short MIDI, a dense pedal piece, tempo changes, and a long performance.
- Exercise recording start/pause/resume/stop, camera/microphone denial, device disconnect, mode changes, and export cancellation/failure.
- Verify preview/export timing, aspect ratio, edited notes, pedal, mute/solo, and audio tails.
- Exit: automated checks pass and the manual matrix has explicit pass/fail/untested results. Hardware-dependent checks must be performed with actual devices; do not mark them passed from mocks.

## 2. Piano sound and response
- Audit the sampled-piano loader used by playback and export; share configuration and handle load failures with actionable errors.
- Verify pedal, overlapping notes, repeated strikes, seeking, looping, velocity, and silence after stop.
- Validate sound/keys/hands/particles together, with restrained defaults and optional generated hands.
- Check offline startup and export. If samples require a network connection, either bundle an appropriately licensed set or disclose the dependency and keep offline readiness open.
- Exit: consistent playback/export sound and timing, no stuck notes, and documented offline behavior.

## 3. First-use clarity
- Walk through the empty app as a new user: import MIDI, record a performance, reopen a project, export.
- Make the next action apparent; explain disabled actions only when useful.
- Keep advanced visual, recording, and export controls in expandable groups; retain all features.
- Verify keyboard navigation, focus, empty/loading/error states, and settings persistence.
- Exit: each core task is discoverable without a tutorial and relevant UI tests pass.

## 4. Project protection
- Validate the entire project document before replacing the current workspace; reject malformed settings without partial loads.
- Save through a temporary sibling file and atomic replacement, preserving the existing project if writing fails.
- Verify cancellation, interrupted writes, corrupt files, unsupported versions, missing media, and save/reopen fidelity (including pedal and manual fingering).
- Audit recovery for Create and recordings; offer explicit restore/discard instead of silently replacing new work. Report storage failures without erasing recovery data.
- Exit: failure-injection tests prove the previous saved project survives and recovery behavior is tested.

## Execution order
Baseline checks -> project safety -> audio consistency -> first-use walkthrough and fixes -> complete workflow regression matrix -> release-readiness report.

## Status
- Software hardening and the automated readiness pass are complete. Release approval remains open for the explicit manual/hardware gates below; passing automation is not evidence of real-device or listening quality.
- Project protection implemented: atomic `.lumina` replacement, validation before workspace replacement, Create recovery with explicit restore/discard, and storage-failure messages. Automated failure-injection tests pass. Recovery saves at three-second intervals, so the latest edits may be lost on abrupt termination.
- Playback and Create export now share bundled piano samples and sampler configuration. Sample-load failures allow retry. Transcription review/export now renders the same bundled samples in an isolated offline audio context, preserving pedal endpoints and overlapping repeated strikes.
- Failed MIDI/library imports now show a persistent actionable error.
- Fixed sustain timing loss in edit snapshots, moves, quantization, copy/paste, delete undo, velocity changes, and project-length recalculation.
- Long-workflow automated check passes: real 20,000-note MIDI import with tempo change, edit, serialization, and reopen with full project equality (over 30 minutes). This does not claim a 30-minute realtime playback or video export soak test.
- Recording review dependencies and media cleanup were corrected; final regression: 73 test files and 788 tests passed on 2026-11-09.
- Production type check passes. Renderer, main, and preload production builds pass; Forge 8 development startup passes. Warnings remain for the large renderer bundle and future native config loading.
- App lint (`npx eslint src electron`): zero errors, 106 code-size warnings.
- Full TypeScript checking including legacy test doubles remains separate from the passing production check.
- Security patches: Electron 42.11.18, Forge 8.0.1, Vite 8.3.6, React Vite plugin 6.2.1, Vitest 4.1.12, and compatible transitive updates verified. Production audit: zero findings. Full audit: zero findings after scoped glob/minimatch security pins. The affected modern consumers were verified with lint, tests, builds, and archive round trips; legacy APIs were left untouched. See TOOLCHAIN-SECURITY.md for the pins and removal criteria. Forge migration follows https://github.com/electron/forge/releases/tag/v8.0.1; main/preload use `.cjs`, build options use `rolldownOptions`, and Node >=22.17 is required.
- Silent real-Electron audio smoke check passed with external network requests blocked: stereo, 3.5-second output, nonzero sustained audio, no clipping, and silent post-release tail. This verifies rendering, not subjective listening quality.
- Desktop startup and recovery prompt visually verified on patched Electron. Restore clicks failed twice with Windows `SendInput sent 0 of 1 events; GetLastError=87`; the manual walkthrough remains incomplete. Actual isolated Electron IndexedDB recovery passed save -> renderer reload -> read -> discard, retaining pedal timing.
- Actual FFmpeg export smoke passes for MP4 and WebM: the app timeline-composition function overlays repeated synthetic fixture clips, encodes two-second files, and both files decode fully without errors. This is not a full visualizer export or long-duration sync assessment.
- Export timing fixed: FFmpeg mixing ignored timestamp-only offsets, starting recorded segments too early. Explicit sample delay now places audio correctly. Real MP3/MP4 outputs verify silence before a one-second start, signal during the segment, and silence after it. Audio-only timelines also correctly map the original video stream.
- Full transcription export stress passed: 60 seconds of real score frames at 1280x720/30fps with sampled audio, encoded through WebCodecs and FFmpeg in about 8.4 seconds. The full result decodes. Cancellation leaves no final output or temporary directories. An injected final-write failure preserves the existing output and cleans all temporary directories.
- Muted repeated microphone clips no longer leave unused FFmpeg split outputs. Negative latency trims the pre-zero part of audio rather than extending the clip. Large-note-count duration calculations no longer spread arrays into Math.max.
- Manual gates still pending: complete save/reopen/export matrix, camera/microphone denial and disconnection, long-performance checks, offline desktop playback/export, visual/keyboard walkthrough, and audible sound-quality review.
- MIDI keyboard checks explicitly deferred at the user's request: no hardware connected. Software tests do not substitute for this gate.
- Distribution and commercial release work intentionally deferred until these gates are reviewed.

## Repeatable silent smoke check
Run `npm run dev` from the repository root, then `npx electron scripts/readiness-smoke.cjs` with the development server on localhost:5173. The runner uses an isolated profile under `.tmp`, mutes its hidden window, blocks external HTTP requests, verifies real sampled audio, recovery persistence, and real MP4/WebM timeline composition and decoding, and exits nonzero on failure. It never touches the user's recovery database. Synthetic export fixtures and outputs stay in `.tmp/export-smoke`; these are test assets, not product showcase media.

## Full export stress check
With the local Vite server on localhost:5173, run `npx electron scripts/export-stress.cjs`. It uses an isolated profile and restricted file bridge under `.tmp/full-export-stress`, performs a real one-minute transcription export, decodes the result, cancels a second export, and injects a final write failure. It is silent and does not touch user projects. Expected output: `FULL_EXPORT_PASS` with `canceled`, `writeFailure`, and `decoded` true and zero temporary directories remaining.

## Final readiness limits
- Automated checks pass; npm audit reports zero findings across both production and development dependencies on this pass. This is an audit result, not a guarantee that no vulnerabilities exist.
- A full 30-minute transcription export passed on 2026-11-09: 7,200 notes, a 30:01.17 output at 1280x720/30fps with stereo audio, full decode, cancellation, and injected write failure cleanup. Live recording soak and varied-machine performance still require real-device acceptance checks. A separate real 4K Create export passed on this machine.
- Physical MIDI, camera/microphone disconnect and permission behavior, subjective piano sound, and the complete manual keyboard/focus walkthrough require real-device/manual verification. There is no connected MIDI keyboard; audio playback was intentionally kept silent. Native UI input previously failed with Windows error 87.
- Distribution, signing, downloads, licensing, and pricing remain outside this phase.

## Extended export soak
`$env:LUMINA_STRESS_SECONDS='1800'; npx electron scripts/export-stress.cjs` selects a 30-minute fixture with 7,200 notes. The default remains a one-minute check. Hot-reload WebSocket traffic is blocked only in this isolated test so dependency/config changes cannot reset it mid-export. Progress is printed for audio preparation and each video-export stage.

## Final verified result — 2026-11-09
- 788 tests across 73 files passed; production type checking and all three production builds passed.
- ESLint: zero errors, 106 existing code-size warnings. Full npm audit: zero findings.
- Patched glob/minimatch consumers passed archive creation/extraction checks through the root, packager, and universal consumers.
- Thirty-minute transcription export: 63,000,692 bytes, fully decodable H.264/AAC, 1280x720, 30fps, stereo 44.1kHz, 30:01.17 including release tail. Frame rendering and encoding took 216.6 seconds after audio preparation. A frame at 15 minutes was visually inspected.
- Mid-export cancellation and injected write failure passed, retained prior output, and left zero current-run temporary directories.
- Piano audio now schedules future voices in 30-second windows; sustain tails remain independent across window boundaries. The short rendering path is unchanged.
- Hardware, subjective listening, remaining manual UI acceptance, are not asserted as passed. Create-mode 4K acceptance passed on this machine. Distribution remains deferred.

## Final Create-mode check — 2026-11-09
A real Three.js Create export passed at 3840x2160 with sampled audio and particles: 60 frames over two seconds, full decode, restored preview size, and no temporary directories left. An exported frame was visually inspected. Run `npx electron scripts/create-4k-smoke.cjs` with the local Vite server on port 5173 to reproduce it.

Temporary-directory failure now clears the export busy state and permits a successful retry; a regression test covers this. The final suite is 788 passing tests. No additional software implementation is left open in this readiness pass. Physical-device, listening, and remaining manual acceptance checks are explicitly not certified by automated tests.

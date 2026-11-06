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
- Implementation in progress; none of the four exit gates is declared complete.
- Project protection implemented: atomic `.lumina` replacement, validation before workspace replacement, Create recovery with explicit restore/discard, and storage-failure messages. Automated failure-injection tests pass. Recovery saves at three-second intervals, so the latest edits may be lost on abrupt termination.
- Playback and Create export now share bundled piano samples and sampler configuration. Sample-load failures allow retry. Transcription review/export now renders the same bundled samples in an isolated offline audio context, preserving pedal endpoints and overlapping repeated strikes.
- Failed MIDI/library imports now show a persistent actionable error.
- Recording review dependencies and media cleanup were corrected; final regression: 71 test files and 777 tests passed on 2026-11-05.
- Production type check passes. Renderer production build passes, with a large-bundle warning.
- App lint (`npx eslint src electron`): zero errors, 106 code-size warnings.
- Full TypeScript checking including legacy test doubles remains separate from the passing production check.
- Dependency installation reported 62 audit findings; dependency triage remains open.
- Silent real-Electron audio smoke check passed with external network requests blocked: stereo, 3.5-second output, nonzero sustained audio, no clipping, and silent post-release tail. This verifies rendering, not subjective listening quality.
- Desktop walkthrough blocked: the Windows helper twice returned `failed to activate captured window`. The app launches, but visual checks are not marked passed.
- Manual gates still pending: complete save/reopen/export matrix, camera/microphone denial and disconnection, long-performance checks, offline desktop playback/export, visual/keyboard walkthrough, and audible sound-quality review.
- MIDI keyboard checks explicitly deferred at the user's request: no hardware connected. Software tests do not substitute for this gate.
- Distribution and commercial release work intentionally deferred until these gates are reviewed.

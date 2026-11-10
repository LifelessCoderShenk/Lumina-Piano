# Lumina Piano software readiness — 2026-11-09

The software-hardening pass is complete and verified. This report does not certify physical hardware or every target machine.

| Check | Result |
| --- | --- |
| Automated tests | 787 passed, 73 files |
| Production type checking | Passed |
| Renderer, main, preload builds | Passed |
| ESLint | 0 errors; 106 code-size warnings |
| Full dependency audit | 0 findings |
| Archive tooling compatibility | Passed through all installed consumers |
| 20,000-note MIDI import/edit/save/reopen | Passed |
| Real recovery storage across reload | Passed |
| MP3/MP4 recorded-audio placement | Passed |
| MP4/WebM timeline encode and decode | Passed |
| 30-minute transcription export | Passed; 7,200 notes, 1280x720/30fps, stereo audio |
| Export cancellation and injected write failure | Passed; no current-run temporary directories left |

The long exported file lasts 30:01.17 including the piano release tail. It is 63,000,692 bytes and decodes fully. A frame at 15 minutes was visually inspected. Renderer/encoding time was 216.6 seconds after audio preparation.

Remaining acceptance work requires actual devices or manual judgment: MIDI/pedal and camera/microphone behavior, listening quality, the complete keyboard/focus walkthrough, live recording soak, and separate 4K Create-mode testing. Native UI automation previously failed with Windows input error 87. No hardware or audible testing was fabricated. Distribution, signing, downloads, trial enforcement, and pricing remain deferred.

Repeatable checks and security-pin rationale are in APP-LAUNCH-PLAN.md and TOOLCHAIN-SECURITY.md. Test artifacts are under `.tmp`, not website showcase media.

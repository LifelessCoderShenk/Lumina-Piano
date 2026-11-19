# macOS preview

Published: https://github.com/LifelessCoderShenk/Lumina-Piano/releases/tag/mac-preview-2 — built from `acc4976`. Apple Silicon and Intel native CI validation both passed; physical-device acceptance remains pending.

Builds run on native GitHub macOS runners via `.github/workflows/macos-preview.yml`: Apple Silicon (`arm64`) and Intel (`x64`). Each runner installs its matching FFmpeg binary, packages the app, checks camera/microphone permission descriptions, launches the packaged renderer, and verifies the account UI and bridge. Only a successful pair is published as a versioned prerelease with SHA-256 files.

Download the ZIP matching the Mac's processor, extract it, and move `Lumina Piano.app` to Applications. These previews are not Developer ID signed or notarized. Gatekeeper may block them; do not disable system security globally. A notarized release requires the owner's Apple Developer account and signing credentials, configured as protected CI secrets rather than committed files.

Before calling this a stable Mac release, test on physical Macs:

- Google login, Keychain session persistence, and sign-out.
- Camera and microphone permission prompts, recording, and recovery after denial.
- Physical MIDI keyboard input and pedal sustain.
- Short exports in all three modes, with audio sync and the branded trial watermark.
- Move-to-Applications launch and reopening existing projects.

CI startup checks do not establish camera, MIDI, performance, or export quality on user hardware. The Mac preview uses the same Supabase account backend and loopback callback as Windows; no new OAuth redirect is needed.

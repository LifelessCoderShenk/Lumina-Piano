# Desktop trial acceptance

This build signs in with the same Supabase/Google identity as the website. Tokens stay in Electron's main process and persist using OS-backed asynchronous safeStorage encryption. The renderer receives only the verified email. A loopback-only PKCE callback listens on port 43821 during sign-in and closes after success/failure or three minutes.

Supabase redirect configured and confirmed by the account owner:

`http://127.0.0.1:43821/auth/callback`

to Authentication → URL Configuration → Redirect URLs in `lumina-staging`. Do not replace the existing website callback. The Google callback remains the Supabase HTTPS callback; do not add this localhost address to Google.

All video-export paths burn in the compact piano symbol with `Lumina` underneath: visualization, camera composite (including the legacy MediaRecorder fallback), and transcription. The watermark is part of encoded frames, not preview UI. Transcription camera overlays are constrained to the score area above the watermark. This trial build intentionally has no paid-export switch; account metadata and local settings cannot remove it. Paid license enforcement and offline entitlement policy still need implementation.

## Required real-app checks before distribution

- Sign in from the title bar using Google in the system browser; verify the same email as the website.
- Restart the app and verify secure session persistence; sign out and restart to verify removal.
- Cancel consent, occupy port 43821, disconnect the network, and allow a login to time out; retry without restarting.
- Export videos from all three modes and inspect the saved files at 720p and 4K for legibility, watermark visibility, correct aspect ratio, and audio sync.
- Test the installer on a clean Windows machine, including uninstall/reinstall without loss of projects.

## Windows preview distribution

The owner confirmed desktop sign-in and the branded export watermark locally. An unsigned preview is published at https://github.com/LifelessCoderShenk/Lumina-Piano/releases/tag/v1.0.0-preview.1 with SHA256SUMS.txt. It is not a completed stable release: clean-machine testing and code signing remain pending.

Preview 1 was built from clean commit `c8a2baf`, excluding ongoing workspace edits. The website pins this exact installer in `website/src/lib/releases.ts`. For subsequent previews, build from a clean commit, verify packaged startup and exports, upload a new versioned asset and checksum, then update that manifest. Do not overwrite published installer assets. macOS and paid licenses remain unavailable.

Run `npm run verify:release` from `website` after each publication. It streams the public installer without authentication or execution, checks its SHA-256 against the reviewed manifest, and verifies the published checksum file. This detects broken downloads or mismatched assets, but does not replace installer testing or code signing.


# Shared Lumina accounts

Status: dependencies installed; production build, TypeScript, lint, and unconfigured production-route smoke checks pass. Dependency audit reports zero vulnerabilities. Live Supabase authentication is not connected or end-to-end verified. Desktop sign-in and export watermark enforcement are not implemented by this change. Account records alone do not activate a desktop trial or license.

## Connect Supabase

1. Install the locked dependencies with `npm ci` from `website`.
2. Create a Supabase project and apply `supabase/migrations/202611090001_accounts.sql` using its SQL editor or migration tooling.
3. Copy `.env.example` to `.env.local`. Set the project URL and **publishable** key from Supabase's Connect dialog. Never put a service-role or secret key in `NEXT_PUBLIC_*` variables.
4. Enable email authentication. In Authentication → Email Templates → Magic Link, use `{{ .Token }}` in the email body so users receive a code. Keep email confirmation enabled. Both first-time and returning users verify their email through the same form.
5. Configure production SMTP, sender identity, the production Site URL, and Supabase authentication rate limits before public launch. Test new and returning users with the actual email templates and delivery provider.
6. Run `npm run lint`, `npm run typecheck`, and `npm run build`. Start with `npm run dev`; open `/login`.

## Access rules

The website checks identity through Supabase `getUser()`, not unverified cookie contents. Session refresh runs on account/sign-in requests. Responses are private and must not be cached by a CDN. Mutations use Next.js Server Actions and their origin checks. Email sending and verification are subject to Supabase's provider rate limits.

Each auth user has one entitlement row, initially `trial`. Row-level security permits reading only that user's row. Browser and desktop clients have no insert/update/delete grants. Never grant a lifetime license from user metadata or a client-side flag. Trusted backend tooling will grant purchased licenses after verified payment when checkout is implemented.

No trial expiry, payment amount, checkout, or installer destination has been invented. Failed entitlement reads show an unavailable state rather than claiming a paid license.

## Required acceptance checks with a configured project

- New email → code → account with trial; returning email uses the same account.
- Incorrect, expired, reused, and rate-limited codes fail without a session.
- Refresh and expiry preserve a valid session; sign-out removes access to `/account`.
- Account A cannot select account B's entitlement or update its own plan through the public API.
- Unauthenticated access cannot read any entitlement; no service-role keys appear in browser bundles.
- Missing database/migration shows status unavailable, not lifetime access.
- Verify mobile navigation, keyboard form submission, pending states, and email delivery.

## Desktop follow-up

Use the same Supabase project and verified user ID. Add desktop sign-in with securely stored refresh credentials, a documented offline policy, and server-verified entitlements. Apply trial watermarks to every video-export path. Do not enable paid exports from a local flag or assume that website sign-in signs in the desktop automatically.

References: https://supabase.com/docs/guides/auth/server-side/creating-a-client and https://supabase.com/docs/guides/auth/auth-email-passwordless

## Staging deployment

- Connect the existing GitHub repository to Vercel; set the root directory to `website` and use the Next.js framework preset. Use Node 22, `npm ci`, and `npm run build`.
- Use a dedicated staging Supabase project. Set the two `.env.example` variables in the Vercel Preview environment. Configure Production independently; preview deployments must not use production customer data.
- Keep staging protected and no-indexed. Do not cache `/login` or `/account` in front of Next.js. Test against the actual HTTPS staging hostname.
- The `Website checks` GitHub workflow runs lint, build, types, and a high-severity audit. Enable it as a required branch check in repository settings before production publishing.
- For an unconfigured local production build, run `npm run start -- --port 3010`, then `node scripts/smoke-accounts.mjs`. This verifies public routes, disabled unconfigured sign-in, private caching, and signed-out redirects. It does not test live identity or database authorization.
- Supabase and Vercel integrations were discovered but were not connected at the time of validation. No cloud project, database migration, or deployment has been created by these local changes.

Security maintenance: Next.js was updated to 16.4.6. The scoped minimatch override removes the vulnerable 7–10 dependency used by TypeScript ESLint; retain lint validation when updating or removing this override.

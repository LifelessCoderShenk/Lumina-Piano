# Google sign-in for Lumina staging

The website implements Supabase's PKCE OAuth flow. Google sign-in stays disabled until provider configuration is complete. No custom domain or Resend account is needed for this flow. Desktop sign-in and export watermark enforcement are separate unfinished work.

## 1. Google Auth Platform

Open https://console.cloud.google.com/auth/overview and create or select a project for Lumina Piano.

- Configure branding as Lumina Piano, with an owner-controlled support/contact email.
- Select an External audience. While in Testing, add the Google accounts of your intended testers. Review Google's publishing requirements before inviting the public.
- Request only basic identity scopes: openid, email, and profile.
- Create an OAuth client of type Web application.
- Authorized JavaScript origin: `https://lumina-staging-phi.vercel.app`
- Authorized redirect URI: `https://sijaebntazfvxnrcykyx.supabase.co/auth/v1/callback`

The Google client secret belongs in Supabase's provider settings, never in website source, public environment variables, or chat. Creating credentials and approving consent/access may require the account owner.

## 2. Supabase

Project: `lumina-staging` (`sijaebntazfvxnrcykyx`).

- Authentication → Sign In / Providers → Google: enter the client ID and secret, then enable Google. Keep nonce and email verification security checks enabled.
- Authentication → URL Configuration → Site URL: `https://lumina-staging-phi.vercel.app`
- Add this exact redirect URL: `https://lumina-staging-phi.vercel.app/auth/callback`
- Do not use wildcard preview URLs for customer authentication. A local callback may be added explicitly for development if needed.

Google redirects to Supabase; Supabase then redirects to the website callback. These two callback URLs are deliberately different.

## 3. Vercel

Project `lumina-staging`, website root `website`. Set:

```text
AUTH_SITE_URL=https://lumina-staging-phi.vercel.app
AUTH_GOOGLE_ENABLED=true
AUTH_EMAIL_CODES_ENABLED=false
```

Keep the existing Supabase URL and publishable-key variables. Redeploy after changing environment settings. Use the canonical staging address to begin sign-in, not an arbitrary preview hostname: PKCE requires the browser's verifier cookie on the callback host.

## 4. Acceptance checks

1. A new tester chooses Continue with Google, consents, and lands at `/account` with their own email and a trial entitlement.
2. A returning tester reaches the same account, without duplicate entitlement rows.
3. Cancelled consent, expired codes, and callbacks without the originating PKCE cookie do not authenticate; they return to the sign-in error state.
4. Sign-out removes access to `/account`. Reopening it redirects to login.
5. `next=https://example.com` and spoofed forwarded-host values cannot select the callback destination.
6. Verify two different users cannot read each other's entitlements or change their own plan.

Do not describe trials as ready until a real installer, desktop authentication, and watermarked export enforcement have also passed acceptance checks.

Provider documentation: https://supabase.com/docs/guides/auth/social-sign-in/auth-google

import { NextResponse, type NextRequest } from "next/server";
import { accountClient } from "@/lib/auth/server";
import { authSiteUrl, googleAuthEnabled } from "@/lib/auth/config";

export async function GET(request: NextRequest) {
  let destination = "/login?error=signin";
  const code = request.nextUrl.searchParams.get("code");
  if (googleAuthEnabled() && code && !request.nextUrl.searchParams.has("error")) {
    const client = await accountClient();
    if (client) {
      // The SSR client verifies the PKCE verifier and writes session cookies.
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) destination = "/account";
    }
  }
  // Fixed origin and destination: never trust forwarded hosts or a next= URL.
  const origin = googleAuthEnabled() ? authSiteUrl() : request.nextUrl.origin;
  const response = NextResponse.redirect(new URL(destination, origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

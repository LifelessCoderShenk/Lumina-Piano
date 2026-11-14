"use server";

import { redirect } from "next/navigation";
import { accountClient } from "@/lib/auth/server";
import { authSiteUrl, googleAuthEnabled } from "@/lib/auth/config";

export async function googleSignIn() {
  if (!googleAuthEnabled()) redirect("/login?error=unavailable");
  const client = await accountClient();
  if (!client) redirect("/login?error=unavailable");
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${authSiteUrl()}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=signin");
  redirect(data.url);
}

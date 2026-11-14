export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export function emailCodesEnabled() {
  return process.env.AUTH_EMAIL_CODES_ENABLED === "true";
}

export function googleAuthEnabled() {
  return process.env.AUTH_GOOGLE_ENABLED === "true" && Boolean(process.env.AUTH_SITE_URL);
}

export function authSiteUrl() {
  const url = new URL(process.env.AUTH_SITE_URL || "http://localhost:3000");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("AUTH_SITE_URL must use HTTPS outside localhost.");
  }
  return url.origin;
}

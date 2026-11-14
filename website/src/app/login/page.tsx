import { redirect } from "next/navigation";
import { accountClient } from "@/lib/auth/server";
import { LoginForm } from "./login-form";
import { emailCodesEnabled, googleAuthEnabled } from "@/lib/auth/config";
import { googleSignIn } from "./google-action";
import { GoogleButton } from "./google-button";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const client = await accountClient();
  if (client && (await client.auth.getUser()).data.user) redirect("/account");
  return <section className="mx-auto w-full max-w-md px-6 py-20 sm:py-28">
    <h1 className="text-4xl font-semibold tracking-tight">Your Lumina account.</h1>
    <p className="mt-4 text-secondary">Sign in or create an account. No password needed.</p>
    {error && <p role="alert" className="mt-5 text-secondary">Sign-in could not be completed. Please try again.</p>}
    {client && googleAuthEnabled() && <form action={googleSignIn} className="mt-8"><GoogleButton /></form>}
    {emailCodesEnabled() && <LoginForm enabled={Boolean(client)} />}
    {(!client || (!emailCodesEnabled() && !googleAuthEnabled())) && <p className="mt-8 text-secondary">Sign-in will be available when accounts launch.</p>}
  </section>;
}

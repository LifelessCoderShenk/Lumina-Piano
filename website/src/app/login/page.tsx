import { redirect } from "next/navigation";
import { accountClient } from "@/lib/auth/server";
import { LoginForm } from "./login-form";
import { emailCodesEnabled } from "@/lib/auth/config";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const client = await accountClient();
  if (client && (await client.auth.getUser()).data.user) redirect("/account");
  return <section className="mx-auto w-full max-w-md px-6 py-20 sm:py-28">
    <h1 className="text-4xl font-semibold tracking-tight">Your Lumina account.</h1>
    <p className="mt-4 text-secondary">Sign in or create an account. No password needed.</p>
    <LoginForm enabled={Boolean(client) && emailCodesEnabled()} />
  </section>;
}

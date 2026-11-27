import { redirect } from "next/navigation";
import { accountClient } from "@/lib/auth/server";
import { Button, ButtonLink } from "@/components/ui/button";
import { signOut } from "@/app/login/actions";
import { accountDeletionEmailUrl, site } from "@/lib/site";

export const metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const client = await accountClient();
  if (!client) redirect("/login");
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: entitlement, error } = await client.from("account_entitlements")
    .select("plan").eq("user_id", user.id).single();
  const paid = !error && entitlement?.plan === "lifetime";
  return <section className="mx-auto max-w-2xl px-6 py-20 sm:py-28">
    <h1 className="text-4xl font-semibold tracking-tight">Your account.</h1>
    <p className="mt-3 break-all text-secondary">{user.email}</p>
    <div className="my-10 rounded-2xl border border-line bg-card p-7">
      <h2 className="text-2xl font-medium">{error ? "Account status unavailable" : paid ? "Lifetime license" : "Free trial"}</h2>
      <p className="mt-3 text-secondary">{error ? "Please refresh to try again." : paid ? "Your one-time license is linked to this account." : "No time limit. Exports include the Lumina watermark."}</p>
      <ButtonLink href="/download" className="mt-6">Get Lumina Piano</ButtonLink>
    </div>
    <form action={signOut}><Button type="submit" variant="secondary">Sign out</Button></form>
    <details className="mt-10 border-t border-line pt-6">
      <summary className="cursor-pointer rounded-sm text-sm text-secondary focus-visible:outline-2 focus-visible:outline-offset-4">Delete your account</summary>
      <p className="mt-4 text-sm leading-relaxed text-secondary">Email us from your account address to request deletion. This opens an email draft; it does not delete your account. Local projects and exported files stay on your device.</p>
      <a href={accountDeletionEmailUrl} className="mt-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Email a deletion request</a>
      <p className="mt-2 break-all text-sm text-secondary">{site.supportEmail}</p>
    </details>
  </section>;
}

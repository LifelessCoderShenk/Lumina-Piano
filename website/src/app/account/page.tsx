import { redirect } from "next/navigation";
import { accountClient } from "@/lib/auth/server";
import { Button, ButtonLink } from "@/components/ui/button";
import { signOut } from "@/app/login/actions";

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
      <p className="mt-3 text-secondary">{error ? "Please refresh to try again." : paid ? "Your one-time license is linked to this account." : "Watermarked exports. One-time purchase coming soon."}</p>
      <ButtonLink href="/download" className="mt-6">Get Lumina Piano</ButtonLink>
    </div>
    <form action={signOut}><Button type="submit" variant="secondary">Sign out</Button></form>
  </section>;
}

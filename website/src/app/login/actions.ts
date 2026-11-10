"use server";

import { redirect } from "next/navigation";
import { accountClient } from "@/lib/auth/server";

export type LoginState = { step: "email" | "code"; email: string; message: string };

export async function login(previous: LoginState, data: FormData): Promise<LoginState> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { step: "email", email, message: "Enter a valid email address." };
  }
  const client = await accountClient();
  if (!client) return { step: "email", email, message: "Sign-in is not available yet. Please try again later." };
  const verifying = previous.step === "code" && data.get("intent") !== "resend";
  if (verifying) {
    const token = String(data.get("code") ?? "").trim();
    if (!/^\d{6,10}$/.test(token)) return { step: "code", email, message: "Enter the code from your email." };
    const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
    if (error) return { step: "code", email, message: "That code is invalid or expired. Try again or request a new code." };
    redirect("/account");
  }
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return {
    step: error ? previous.step : "code", email,
    message: error ? "Unable to send a code right now. Wait a minute and try again." : "Check your email for your sign-in code.",
  };
}

export async function signOut() {
  const client = await accountClient();
  if (client) {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new Error("Could not sign out. Please try again.");
  }
  redirect("/login");
}

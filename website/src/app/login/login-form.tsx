"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { login, type LoginState } from "./actions";

export function LoginForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { step: "email", email: "", message: "" });
  return (
    <form action={action} className="mt-8 grid gap-5">
      <div className="grid gap-2">
        <label htmlFor="email" className="text-sm">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254}
          readOnly={state.step === "code"} defaultValue={state.email}
          className="min-h-12 rounded-lg border border-line bg-background px-4" />
      </div>
      {state.step === "code" && <div className="grid gap-2">
        <label htmlFor="code" className="text-sm">Sign-in code</label>
        <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6,10}" maxLength={10} autoFocus
          className="min-h-12 rounded-lg border border-line bg-background px-4 tracking-widest" />
      </div>}
      <p role="status" aria-live="polite" className="text-sm text-secondary">
        {!enabled ? "Sign-in will be available when accounts launch." : state.message}
      </p>
      <Button type="submit" disabled={!enabled || pending}>
        {pending ? "Please wait…" : state.step === "email" ? "Continue with email" : "Sign in"}
      </Button>
      {state.step === "code" && <div className="flex justify-between text-sm">
        <a href="/login" className="underline">Change email</a>
        <button name="intent" value="resend" formNoValidate disabled={pending} className="underline">Send a new code</button>
      </div>}
    </form>
  );
}

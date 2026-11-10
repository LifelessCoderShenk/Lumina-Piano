"use client";

import { Button } from "@/components/ui/button";

export default function LoginError({ reset }: { reset: () => void }) {
  return <section className="mx-auto max-w-md px-6 py-20">
    <h1 className="text-3xl font-semibold">Sign-in is temporarily unavailable.</h1>
    <p className="my-5 text-secondary">Please try again in a moment.</p>
    <Button onClick={reset}>Try again</Button>
  </section>;
}

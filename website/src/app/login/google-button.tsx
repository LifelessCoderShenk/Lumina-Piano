"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function GoogleButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} className="w-full">
    {pending ? "Opening Google…" : "Continue with Google"}
  </Button>;
}

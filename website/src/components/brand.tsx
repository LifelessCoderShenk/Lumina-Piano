import Link from "next/link";
import { Piano } from "lucide-react";

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Lumina Piano home"
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm text-[13px] font-semibold tracking-[-0.035em] sm:gap-3 sm:text-[15px]"
    >
      <Piano size={23} strokeWidth={1.5} aria-hidden="true" />
      Lumina Piano
    </Link>
  );
}

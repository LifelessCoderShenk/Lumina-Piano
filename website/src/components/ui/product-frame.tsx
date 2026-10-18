import type { ReactNode } from "react";
import { Piano } from "lucide-react";

/** A neutral frame for future approved product media. Never impersonates a screenshot. */
export function ProductFrame({
  children,
  caption = "Product preview coming soon",
  className = "",
}: {
  children?: ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <figure
      className={`overflow-hidden rounded-2xl border border-line bg-card ${className}`}
    >
      <div className="flex min-h-56 items-center justify-center p-8 sm:min-h-72">
        {children ?? (
          <div className="flex flex-col items-center gap-4 text-secondary">
            <Piano size={32} strokeWidth={1.25} aria-hidden="true" />
            <span className="text-sm">A closer look, soon.</span>
          </div>
        )}
      </div>
      <figcaption className="border-t border-line px-6 py-4 text-center text-xs text-secondary">
        {caption}
      </figcaption>
    </figure>
  );
}

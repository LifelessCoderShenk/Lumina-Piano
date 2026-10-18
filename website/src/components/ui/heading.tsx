import type { ReactNode } from "react";

type HeadingProps = {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
  id?: string;
};

export function Heading({
  children,
  as: Tag = "h1",
  className = "",
  id,
}: HeadingProps) {
  return (
    <Tag
      id={id}
      className={`text-balance font-medium tracking-[-0.055em] ${Tag === "h1" ? "text-[clamp(2.75rem,7vw,5.75rem)] leading-[1.06]" : "text-3xl leading-tight sm:text-4xl"} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-secondary">
      {children}
    </p>
  );
}

import Link from "next/link";
import type { ComponentProps, ComponentPropsWithoutRef } from "react";

type Variant = "primary" | "secondary";
function classes(variant: Variant, className: string) {
  return `button button--${variant} ${className}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ComponentPropsWithoutRef<"button"> & { variant?: Variant }) {
  return (
    <button type={type} className={classes(variant, className)} {...props} />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={classes(variant, className)} {...props} />;
}

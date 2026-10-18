import type { ReactNode } from "react";
import { Container } from "./ui/container";
import { Eyebrow, Heading } from "./ui/heading";

export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Container className="page-enter py-20 sm:py-28 lg:py-32">
      <div className="max-w-3xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading>{title}</Heading>
        <p className="mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-secondary sm:text-xl">
          {description}
        </p>
      </div>
      {children}
    </Container>
  );
}

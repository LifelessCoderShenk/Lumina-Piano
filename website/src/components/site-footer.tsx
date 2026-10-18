import Link from "next/link";
import { Brand } from "./brand";
import { Container } from "./ui/container";
import { navigation } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <Container className="py-10 sm:py-12">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
          <div>
            <Brand />
            <p className="mt-3 text-sm text-secondary">
              Made for the music you make.
            </p>
          </div>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap gap-x-6 gap-y-1 md:max-w-md"
          >
            {navigation.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="nav-link inline-flex min-h-11 items-center"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-line pt-6 text-xs leading-5 text-secondary sm:flex-row">
          <p>© {new Date().getFullYear()} Lumina Piano. All rights reserved.</p>
          <p>For Windows and macOS.</p>
        </div>
      </Container>
    </footer>
  );
}

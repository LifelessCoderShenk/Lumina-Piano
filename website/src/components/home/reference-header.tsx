"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Piano, X } from "lucide-react";
import styles from "./reference-header.module.css";

const links = [
  ["/", "Home"],
  ["/features", "Features"],
  ["/showcase", "Showcase"],
  ["/pricing", "Pricing"],
] as const;

/** Shared two-row masthead across every website route. */
export function ReferenceHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <header
      className={styles.header}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className={styles.inner}>
        <div className={styles.top}>
          <Link
            href="/"
            className={styles.brand}
            aria-label="Lumina Piano home"
          >
            <Piano aria-hidden="true" strokeWidth={1.25} />
            <span>Lumina Piano</span>
          </Link>
          <span className={styles.platforms}>
            Windows <span aria-hidden="true">/</span> macOS
          </span>
          <button
            ref={toggle}
            className={styles.toggle}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="site-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        <nav
          id="site-navigation"
          aria-label="Main navigation"
          className={`${styles.navigation} ${open ? styles.open : ""}`}
        >
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={href === pathname ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/download"
            className={styles.download}
            aria-current={pathname === "/download" ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            Download
          </Link>
        </nav>
      </div>
    </header>
  );
}

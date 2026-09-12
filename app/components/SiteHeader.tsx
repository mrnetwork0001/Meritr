"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const LINKS = [
  ["Problem", "/#problem"],
  ["How it works", "/#how"],
  ["Guarantee", "/#guarantee"],
  ["Evidence", "/#evidence"],
  ["Docs", "/docs"],
] as const;

/**
 * Sticky header: logo left, navigation right.
 *
 * Spans wider than the content beneath it, so it reads as chrome framing the page rather than
 * as another column of it. Below md the links collapse behind a hamburger - there is not room
 * for five of them on a phone, and letting them wrap pushed the logo onto its own line.
 */
export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  // Escape closes it, and the menu never survives a resize into the desktop layout - a panel
  // left open behind a breakpoint change is invisible but still traps focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const mq = window.matchMedia("(min-width: 768px)");
    const onWide = () => mq.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-ink-950/80 backdrop-blur">
      <nav className="wrap-header flex items-center justify-between gap-6 py-3">
        <Link
          href="/"
          aria-label="Meritr, home"
          className="flex shrink-0 items-center"
          onClick={() => setOpen(false)}
        >
          <img
            src="/brand/meritr-header.png"
            alt="Meritr"
            width={720}
            height={107}
            className="h-7 w-auto"
          />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map(([label, href]) =>
            href.startsWith("/#") ? (
              <a key={href} href={href} className="navlink">
                {label}
              </a>
            ) : (
              <Link key={href} href={href} className="navlink">
                {label}
              </Link>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="-mr-1.5 rounded p-2 text-[#8b93a5] transition hover:bg-ink-800 hover:text-[#eef0f5] md:hidden"
        >
          {open ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
        </button>
      </nav>

      <div
        id="site-menu"
        hidden={!open}
        className="border-t border-[var(--color-line)] bg-ink-950/95 md:hidden"
      >
        <div className="wrap-header flex flex-col py-2">
          {LINKS.map(([label, href]) =>
            href.startsWith("/#") ? (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="navlink py-3 text-[15px]"
              >
                {label}
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="navlink py-3 text-[15px]"
              >
                {label}
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}

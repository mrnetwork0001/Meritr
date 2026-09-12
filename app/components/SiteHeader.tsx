import Link from "next/link";

const REPO = "https://github.com/mrnetwork0001/Meritr";

const LINKS = [
  ["Problem", "/#problem"],
  ["How it works", "/#how"],
  ["Guarantee", "/#guarantee"],
  ["Evidence", "/#evidence"],
] as const;

/**
 * Sticky header: logo left, navigation right.
 *
 * Spans wider than the content beneath it, so it reads as chrome framing the page rather than
 * as another column of it. The page carries two prominent Launch app calls already — in the
 * hero and the closing section — so the header stays text-only rather than competing with them.
 */
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-ink-950/80 backdrop-blur">
      <nav className="wrap-header flex items-center justify-between gap-6 py-3">
        <Link href="/" aria-label="Meritr, home" className="flex shrink-0 items-center">
          <img
            src="/brand/meritr-header.png"
            alt="Meritr"
            width={720}
            height={107}
            className="h-7 w-auto"
          />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="navlink">
              {label}
            </a>
          ))}
          <a href={REPO} target="_blank" rel="noreferrer" className="navlink">
            GitHub
          </a>
          <Link href="/app" className="navlink">
            App
          </Link>
        </div>

        {/* Below md the links collapse; the hero's Launch app call is immediately below. */}
        <Link href="/app" className="navlink md:hidden">
          App →
        </Link>
      </nav>
    </header>
  );
}

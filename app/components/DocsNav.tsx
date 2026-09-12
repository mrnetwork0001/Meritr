"use client";

import { useEffect, useState } from "react";

/**
 * Docs sidebar with a scroll-spy rail.
 *
 * The active item is derived from what is actually on screen rather than from the URL hash, so
 * scrolling and clicking agree with each other. IntersectionObserver only fires for headings in
 * the top third of the viewport, which keeps the highlight from racing ahead on fast scrolls.
 */

export type DocsSection = { id: string; label: string };
export type DocsGroup = { title: string; items: DocsSection[] };

export function DocsNav({ groups }: { groups: DocsGroup[] }) {
  const ids = groups.flatMap((g) => g.items.map((i) => i.id));
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => {
    const seen = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = ids.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-80px 0px -66% 0px", threshold: 0 }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [ids.join("|")]);

  return (
    <nav aria-label="Documentation" className="text-[13.5px]">
      {groups.map((g) => (
        <div key={g.title} className="mb-7">
          <p className="eyebrow mb-2 text-[9px]">{g.title}</p>
          <ul className="border-l border-[var(--color-line)]">
            {g.items.map((i) => {
              const on = active === i.id;
              return (
                <li key={i.id}>
                  <a
                    href={`#${i.id}`}
                    aria-current={on ? "true" : undefined}
                    className={`-ml-px block border-l py-1.5 pl-3.5 transition-colors ${
                      on
                        ? "border-model bg-model/8 text-model"
                        : "border-transparent text-[#8b93a5] hover:text-[#d5d9e2]"
                    }`}
                  >
                    {i.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

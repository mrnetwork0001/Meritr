"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fades its children up once, the first time they scroll into view.
 *
 * Starts in the revealed state and only hides itself after mount, so a reader whose JavaScript
 * never runs — or who arrives before hydration — sees the content rather than an empty page.
 * That ordering is the whole point: a scroll animation must never be able to hide the copy.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    setArmed(true);
    setShown(false);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${armed ? "reveal" : ""} ${shown ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Wraps a grid whose children should arrive in sequence inside a Reveal. */
export function Stagger({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`stagger ${className}`}>{children}</div>;
}

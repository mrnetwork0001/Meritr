"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChartColumn,
  ChartLine,
  ChevronLeft,
  ClipboardCheck,
  HandCoins,
  Menu,
  Newspaper,
  Power,
  Wallet,
  X,
} from "lucide-react";
import { useWallet } from "../lib/wallet";
import { chainName } from "../lib/chains";
import type { Health } from "../lib/api";

export type ViewId =
  | "overview"
  | "positions"
  | "actions"
  | "attestations"
  | "interventions"
  | "model";

const RAIL_OPEN = 232;
const RAIL_COLLAPSED = 68;
const STORAGE_KEY = "meritr.rail.collapsed";

const ITEMS: Array<{
  id: ViewId;
  label: string;
  title: string;
  Icon: typeof ChartLine;
}> = [
  { id: "overview", label: "Overview", title: "Pool state and the live risk book", Icon: ChartLine },
  { id: "positions", label: "Positions", title: "Per-borrower credit memory and loan", Icon: Wallet },
  { id: "actions", label: "Actions", title: "Supply, borrow, repay or trigger the agent", Icon: HandCoins },
  { id: "attestations", label: "Attestations", title: "The Attestcoin ingestion path", Icon: Newspaper },
  { id: "interventions", label: "Interventions", title: "Every restructuring, from chain logs", Icon: ClipboardCheck },
  { id: "model", label: "Model", title: "Scoring components and pricing curve", Icon: ChartColumn },
];

/**
 * Collapsible navigation rail for the risk console.
 *
 * Width is driven by a `--rail` CSS custom property on the wrapper rather than by swapping
 * classes, so the rail and the content margin animate off one value and can never disagree
 * mid-transition. Collapse state persists per browser.
 *
 * On small screens the rail becomes an off-canvas drawer: `-translate-x-full` by default, slid
 * in by the header's menu button, and dismissed by Escape, the backdrop, or picking a section.
 */
export function AppRail({
  view,
  onView,
  health,
  expectedChainId,
  children,
}: {
  view: ViewId;
  onView: (v: ViewId) => void;
  health: Health | null;
  expectedChainId: number | null;
  children: React.ReactNode;
}) {
  const { account, chainId, connect, disconnect, available, connecting } = useWallet();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  // Restore the reader's last choice after mount, so SSR and first paint agree.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* private browsing: fall back to expanded */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* nothing to persist to; the session still works */
      }
      return next;
    });
  };

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const online = health?.status === "ok";

  return (
    <div
      // Transparent on purpose: the dot-grid lives on <body> and this is the only thing
      // between it and the reader. An opaque surface here hid the texture on every console
      // view while the landing page kept it, which made the two halves look unrelated.
      className="min-h-screen"
      style={{ ["--rail" as string]: `${collapsed ? RAIL_COLLAPSED : RAIL_OPEN}px` }}
    >
      {/* Mobile header */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-line)] bg-ink-950/95 px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center" aria-label="Meritr, back to the overview">
          <img
            src="/brand/meritr-header.png"
            alt="Meritr"
            width={720}
            height={107}
            className="h-7 w-auto"
          />
        </Link>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open the menu"
          aria-expanded={drawer}
          aria-controls="app-rail"
          className="ml-auto rounded border border-[var(--color-line)] p-2 text-gray-400 transition hover:bg-ink-800 hover:text-gray-100"
        >
          <Menu size={18} aria-hidden />
        </button>
      </div>

      {/* Backdrop for the mobile drawer */}
      {drawer && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm md:hidden"
          onClick={() => setDrawer(false)}
          aria-hidden
        />
      )}

      {/* Rail */}
      <aside
        id="app-rail"
        aria-label="Sections"
        className={`fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col overflow-y-auto border-r border-[var(--color-line)] bg-ink-950/85 backdrop-blur transition-transform duration-200 md:z-30 md:w-[var(--rail)] md:translate-x-0 md:transition-[width] ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand + controls */}
        <div className="flex h-16 shrink-0 items-center gap-2 px-4">
          <Link
            href="/"
            aria-label="Meritr, back to the landing page"
            className="group flex min-w-0 flex-1 items-center gap-2.5"
          >
            {/* Collapsed, the wordmark would be clipped to nonsense - show the mark alone. */}
            {collapsed ? (
              <img
                src="/brand/meritr-mark.png"
                alt="Meritr"
                width={512}
                height={512}
                className="h-7 w-7 shrink-0"
              />
            ) : (
              <span className="min-w-0">
                <img
                  src="/brand/meritr-header.png"
                  alt="Meritr"
                  width={720}
                  height={107}
                  className="h-7 w-auto"
                />
                <span className="mt-1 block truncate font-mono text-[9px] tracking-[0.14em] text-gray-600">
                  CREDIT MEMORY
                </span>
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label="Close the menu"
            className="shrink-0 rounded p-1 text-gray-500 transition hover:bg-ink-800 hover:text-gray-200 md:hidden"
          >
            <X size={17} aria-hidden />
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand" : "Collapse"}
            className="hidden shrink-0 rounded p-1 text-gray-600 transition hover:bg-ink-800 hover:text-gray-200 md:block"
          >
            <ChevronLeft
              size={16}
              aria-hidden
              className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Sections */}
        <nav className="flex-1 space-y-1 px-2.5 py-3">
          {ITEMS.map(({ id, label, title, Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                title={collapsed ? label : title}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  onView(id);
                  setDrawer(false);
                }}
                className={`flex w-full items-center gap-3 rounded px-2.5 py-2.5 text-left text-[14px] transition md:py-2 md:text-[13.5px] ${
                  active ? "bg-model/15 text-model" : "text-gray-400 hover:bg-ink-800 hover:text-gray-100"
                }`}
              >
                <Icon size={17} aria-hidden className="shrink-0" />
                <span className={`min-w-0 flex-1 truncate ${collapsed ? "md:hidden" : ""}`}>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Wallet / status card.
            Shows the connected account when there is one, and what the console is reading when
            there is not. It never invents a balance: an unconnected reader is told plainly that
            the view is read-only rather than shown a placeholder they could mistake for real. */}
        <div className="px-2.5 pb-4 md:pb-3">
          <div className="rounded-lg border border-[var(--color-line)]">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  account ? "bg-up" : online ? "anim-breathe bg-model" : "bg-gray-700"
                }`}
                aria-hidden
              />
              {!collapsed && (
                <>
                  <span className="mono min-w-0 flex-1 truncate text-[12.5px] text-gray-200">
                    {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "not connected"}
                  </span>
                  {account && (
                    <button
                      type="button"
                      onClick={disconnect}
                      aria-label="Disconnect"
                      title="Forget this account"
                      className="shrink-0 rounded p-0.5 text-gray-600 transition hover:bg-ink-800 hover:text-down"
                    >
                      <Power size={13} aria-hidden />
                    </button>
                  )}
                </>
              )}
            </div>

            {!collapsed && (
              <div className="border-t border-[var(--color-line)] px-3 py-2">
                {account ? (
                  <Row
                    k="NETWORK"
                    v={chainName(chainId)}
                    warn={expectedChainId !== null && chainId !== expectedChainId}
                  />
                ) : (
                  <Row k="READING" v={health?.network ?? "-"} />
                )}
              </div>
            )}

            {!collapsed && !account && (
              <div className="border-t border-[var(--color-line)] px-3 py-2.5">
                <button
                  type="button"
                  onClick={connect}
                  disabled={available !== true || connecting}
                  className="w-full rounded bg-model px-3 py-1.5 font-mono text-[12px] font-bold text-ink-950 transition hover:bg-model/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {available === null
                    ? "Wallet…"
                    : !available
                      ? "No wallet found"
                      : connecting
                        ? "Connecting…"
                        : "Connect wallet"}
                </button>
              </div>
            )}
          </div>

          {!collapsed && !account && (
            <p className="mt-2 px-1 font-mono text-[9.5px] leading-relaxed text-gray-700">
              the console is fully readable without a wallet
            </p>
          )}
        </div>
      </aside>

      {/* Content */}
      <div className="min-w-0 transition-[margin] duration-200 md:ml-[var(--rail)]">{children}</div>
    </div>
  );
}

/** One label/value line inside the rail's status card. */
function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="font-mono text-[10.5px] tracking-wider text-gray-600">{k}</span>
      <span className={`mono truncate pl-2 text-[12.5px] font-bold ${warn ? "text-down" : "text-gray-100"}`}>
        {v}
      </span>
    </div>
  );
}

export const RAIL_ITEMS = ITEMS;

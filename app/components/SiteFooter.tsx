import Link from "next/link";

const REPO = "https://github.com/mrnetwork0001/Meritr";
const EXPLORER = "https://creditcoin-testnet.blockscout.com";
const VAULT = "0x233D2aE279230fBFFbe61e6dF2A9DC6bF6ff3e84";

const COLS = [
  {
    title: "Product",
    links: [
      ["Launch app", "/app"],
      ["How it works", "/#how"],
      ["The guarantee", "/#guarantee"],
      ["Evidence", "/#evidence"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["README", `${REPO}/blob/main/README.md`],
      ["Attestcoin integration", `${REPO}/blob/main/docs/ATTESTCOIN_INTEGRATION.md`],
      ["Architecture", `${REPO}/blob/main/docs/ARCHITECTURE.md`],
      ["Contracts", `${REPO}/tree/main/contracts`],
    ],
  },
  {
    title: "On-chain",
    links: [
      ["MeritrVault", `${EXPLORER}/address/${VAULT}`],
      ["MeritrAttestor", `${EXPLORER}/address/0xB462C2772b8003e3c511C373dDC5715642B34D4c`],
      ["Creditcoin", "https://creditcoin.org"],
      ["Attestcoin docs", "https://docs.attestcoin.org"],
    ],
  },
] as const;

export default function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-line)] py-14">
      <div className="wrap pb-2">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" aria-label="Meritr, home" className="inline-block">
              <img src="/brand/meritr-header.png" alt="Meritr" width={720} height={107} className="h-9 w-auto" />
            </Link>
            <p className="mt-5 text-[14.5px] leading-relaxed text-[#8b93a5]">
              Reads a borrower&apos;s real repayment history from Ethereum through Creditcoin&apos;s
              Attestcoin verifier, scores it into portable credit, and restructures distressed
              loans before they can be liquidated.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="chip">Apache 2.0</span>
              <span className="chip">BUIDL CTC 2026</span>
            </div>
          </div>

          {COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="eyebrow">{col.title}</p>
              <ul className="mt-4 space-y-2">
                {col.links.map(([label, href]) => {
                  const ext = href.startsWith("http");
                  return (
                    <li key={label}>
                      <a
                        href={href}
                        {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="text-[14px] text-[#9aa3b4] transition hover:text-model"
                      >
                        {label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

      </div>
    </footer>
  );
}

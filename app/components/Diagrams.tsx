/**
 * Hand-drawn SVG diagrams of Meritr's actual mechanism.
 *
 * Every one of these draws something the protocol really does, with the real thresholds and
 * the real precompile addresses. A diagram that illustrates a generic "blockchain flow" is
 * decoration; these are the argument.
 *
 * Server components — no client JS. Motion is CSS-only and lives entirely inside the
 * prefers-reduced-motion query, so a reader who has asked for less gets the identical static
 * drawing rather than a jumpier one.
 */

const LINE = "rgba(255,255,255,0.16)";
const DIM = "rgba(255,255,255,0.38)";
const MODEL = "#818cf8";
const UP = "#34d399";
const DOWN = "#fb7185";

function Label({
  x,
  y,
  children,
  fill = DIM,
  size = 9,
  anchor = "middle",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  fill?: string;
  size?: number;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fontSize={size}
      textAnchor={anchor}
      fontFamily="var(--font-jetbrains), monospace"
      letterSpacing="0.06em"
    >
      {children}
    </text>
  );
}

/**
 * The Attestcoin path: a real Ethereum transaction becomes on-chain credit on Creditcoin,
 * with no oracle anywhere between them.
 */
export function ProofDiagram({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 132" className={className} role="img" aria-label="Attestcoin proof path">
      {/* source */}
      <rect x="6" y="40" width="92" height="46" rx="8" fill="none" stroke={LINE} />
      <Label x={52} y={60} fill="#e8eaf0" size={10}>ETHEREUM</Label>
      <Label x={52} y={74}>Aave V3 repay</Label>

      {/* precompile */}
      <rect x="152" y="34" width="108" height="58" rx="8" fill="none" stroke={MODEL} strokeOpacity="0.5" />
      <Label x={206} y={54} fill={MODEL} size={10}>0x…0FD2</Label>
      <Label x={206} y={68}>Merkle + continuity</Label>
      <Label x={206} y={81}>verified by the runtime</Label>

      {/* credit */}
      <rect x="314" y="40" width="100" height="46" rx="8" fill="none" stroke={UP} strokeOpacity="0.45" />
      <Label x={364} y={60} fill={UP} size={10}>CREDIT MEMORY</Label>
      <Label x={364} y={74}>score 300–900</Label>

      {/* flow */}
      <path d="M98 63 H152" stroke={LINE} strokeDasharray="4 4" className="anim-dash" fill="none" />
      <path d="M260 63 H314" stroke={LINE} strokeDasharray="4 4" className="anim-dash" fill="none" />
      <circle r="2.6" fill={MODEL} className="anim-travel" style={{ ["--travel" as string]: "54px" }} cx="98" cy="63" />
      <circle r="2.6" fill={UP} className="anim-travel" style={{ ["--travel" as string]: "54px" }} cx="260" cy="63" />

      <Label x={125} y={56} size={8}>proof</Label>
      <Label x={287} y={56} size={8}>facts</Label>
      <Label x={206} y={112} size={8.5}>no oracle operator in this path</Label>
    </svg>
  );
}

/**
 * The health bands. Meritr's entire thesis lives in the orange sliver between
 * liquidation and safety, so the drawing is mostly that sliver.
 */
export function BandsDiagram({ className = "" }: { className?: string }) {
  const x = (hf: number) => 20 + ((hf - 0.85) / (1.55 - 0.85)) * 380;
  return (
    <svg viewBox="0 0 420 116" className={className} role="img" aria-label="Health factor bands">
      <rect x={x(0.85)} y="44" width={x(1.0) - x(0.85)} height="20" fill={DOWN} fillOpacity="0.22" />
      <rect x={x(1.0)} y="44" width={x(1.15) - x(1.0)} height="20" fill="#f2c14e" fillOpacity="0.26" />
      <rect x={x(1.15)} y="44" width={x(1.3) - x(1.15)} height="20" fill={MODEL} fillOpacity="0.18" />
      <rect x={x(1.3)} y="44" width={x(1.55) - x(1.3)} height="20" fill={UP} fillOpacity="0.18" />
      <rect x="20" y="44" width="380" height="20" fill="none" stroke={LINE} />

      {[1.0, 1.15, 1.35].map((m) => (
        <g key={m}>
          <line x1={x(m)} y1="38" x2={x(m)} y2="70" stroke={DIM} />
          <Label x={x(m)} y={84}>{m.toFixed(2)}</Label>
        </g>
      ))}

      <Label x={x(0.93)} y={32} fill={DOWN}>seize</Label>
      <Label x={x(1.075)} y={32} fill="#f2c14e">RESTRUCTURE</Label>
      <Label x={x(1.42)} y={32} fill={UP}>healthy</Label>

      <path d={`M${x(1.07)} 96 H${x(1.35)}`} stroke={UP} strokeDasharray="3 3" className="anim-dash" fill="none" />
      <circle cx={x(1.35)} cy="96" r="3" fill={UP} className="anim-breathe" />
      <Label x={x(1.21)} y={110} size={8.5}>the agent moves a borrower here, without seizing collateral</Label>
    </svg>
  );
}

/** The three levers, in the order the vault applies them. */
export function LeversDiagram({ className = "" }: { className?: string }) {
  const rows = [
    ["01", "Rate relief", "reprice to what the borrower earned", "free"],
    ["02", "Term extension", "+30 days, no forced sale", "free"],
    ["03", "Micro-refinance", "retire debt from the reserve", "reserve"],
  ];
  return (
    <svg viewBox="0 0 420 132" className={className} role="img" aria-label="The three restructuring levers">
      {rows.map(([n, name, detail, cost], i) => {
        const y = 18 + i * 38;
        const accent = i === 2 ? MODEL : DIM;
        return (
          <g key={n}>
            <rect x="8" y={y} width="404" height="30" rx="6" fill="none" stroke={i === 2 ? MODEL : LINE} strokeOpacity={i === 2 ? 0.45 : 1} />
            <Label x={26} y={y + 19} fill={accent} size={10} anchor="middle">{n}</Label>
            <Label x={46} y={y + 19} fill="#e8eaf0" size={10} anchor="start">{name}</Label>
            <Label x={166} y={y + 19} anchor="start" size={9}>{detail}</Label>
            <Label x={402} y={y + 19} anchor="end" fill={accent} size={9}>{cost}</Label>
          </g>
        );
      })}
    </svg>
  );
}

/** What the score is made of, and what is withheld until something is proven. */
export function ScoreDiagram({ className = "" }: { className?: string }) {
  const parts = [
    ["Repayment history", 35, MODEL],
    ["Collateral depth", 25, "#6f7ae0"],
    ["Wallet maturity", 15, "#5f69c9"],
    ["Chain diversity", 10, "#4e57ad"],
    ["Liquidation safety", 15, UP],
  ] as const;
  let acc = 0;
  return (
    <svg viewBox="0 0 420 128" className={className} role="img" aria-label="Score composition">
      {parts.map(([name, pct, colour]) => {
        const w = (pct / 100) * 396;
        const x = 12 + acc;
        acc += w;
        return <rect key={name} x={x} y="20" width={w - 2} height="22" rx="3" fill={colour} fillOpacity="0.7" />;
      })}
      <rect x="12" y="20" width="396" height="22" rx="3" fill="none" stroke={LINE} />
      {(() => {
        let a = 0;
        return parts.map(([name, pct]) => {
          const w = (pct / 100) * 396;
          const cx = 12 + a + w / 2;
          a += w;
          return (
            <g key={name}>
              <Label x={cx} y={56} size={8.5}>{pct}%</Label>
              <Label x={cx} y={72} size={7.5} fill="rgba(255,255,255,0.3)">
                {name.split(" ")[0]}
              </Label>
            </g>
          );
        });
      })()}
      <line x1="12" y1="92" x2="408" y2="92" stroke={LINE} />
      <Label x={210} y={110} size={8.5}>
        a wallet with nothing proven scores exactly 300 — safety is withheld, not assumed
      </Label>
    </svg>
  );
}

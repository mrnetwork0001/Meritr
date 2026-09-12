import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { loadFont as loadSans } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { PRESENT_CLIPS, PRESENT_VO } from './clips';
import { STATS } from './stats';

const SANS = loadSans('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;
const MONO = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily;

/* Palette lifted from the product, so the video and the console agree.
   model  - a value Meritr computed      up - solvent, proven, healthy
   down   - distressed, refused          warn - needs attention             */
const INK = '#07090F';
const INK_800 = '#131826';
const MODEL = '#818CF8';
const UP = '#34D399';
const DOWN = '#FB7185';
const WARN = '#F2C14E';
const TEXT = '#F7F8FB';
const MUTED = '#8B93A5';
const DIM = '#5D6474';
const LINE = 'rgba(255,255,255,0.09)';

const FILL: React.CSSProperties = { position: 'absolute', inset: 0 };

/* ── primitives ─────────────────────────────────────────────────────────── */

const rise = (frame: number, delay: number, dur = 20) =>
  interpolate(frame - delay, [0, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Fade in, hold, fade out - so no scene ever cuts on a hard edge. */
const hold = (frame: number, total: number, inF = 14, outF = 14) =>
  Math.min(
    interpolate(frame, [0, inF], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(frame, [total - outF, total], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );

/** The dot grid from the landing page. Present but never loud. */
const Grid: React.FC<{ opacity?: number }> = ({ opacity = 0.55 }) => (
  <AbsoluteFill
    style={{
      opacity,
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)',
      backgroundSize: '34px 34px',
    }}
  />
);

const Stage: React.FC<{ children: React.ReactNode; total: number }> = ({ children, total }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: INK, fontFamily: SANS, opacity: hold(frame, total) }}>
      <Grid />
      {children}
    </AbsoluteFill>
  );
};

/**
 * A slot for footage you record yourself.
 *
 * Renders the clip when it exists. When it does not - which is every render before the screen
 * capture is cut - it draws a labelled placeholder of the right length instead of failing, so
 * the composition stays renderable while the recordings are still being made.
 */
const Footage: React.FC<{
  src: string; total: number; label: string; note: string; playbackRate?: number;
  /**
   * Rendered instead of the "record this" card when the clip is absent.
   *
   * Some scenes recreate something that exists for real - the agent's terminal, the explorer
   * page showing who signed a transaction. Real footage of those is strictly more convincing
   * than a rebuilt version, but a rebuilt version is much better than a placeholder. So the
   * clip wins when it exists and the graphic carries the scene when it does not.
   */
  fallback?: React.ReactNode;
}> = ({ src, total, label, note, playbackRate = 1, fallback }) => {
  const frame = useCurrentFrame();
  const o = hold(frame, total, 10, 10);
  // Asked of a generated manifest rather than caught at runtime: OffthreadVideo throws inside
  // the compositor when a source 404s, which no onError handler can intercept.
  const missing = !PRESENT_CLIPS.includes(src);

  if (missing && fallback) return <>{fallback}</>;

  if (missing) {
    return (
      <AbsoluteFill style={{ backgroundColor: INK, fontFamily: SANS, opacity: o }}>
        <Grid opacity={0.4} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            border: `2px dashed ${LINE}`, borderRadius: 18, padding: '54px 72px',
            textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)',
          }}>
            <p style={{ fontFamily: MONO, fontSize: 15, letterSpacing: 2, color: WARN, margin: 0 }}>
              RECORD THIS
            </p>
            <p style={{ fontSize: 42, fontWeight: 600, color: TEXT, margin: '18px 0 10px' }}>{label}</p>
            <p style={{ fontSize: 20, color: MUTED, margin: 0, maxWidth: 760, lineHeight: 1.5 }}>{note}</p>
            <p style={{ fontFamily: MONO, fontSize: 14, color: DIM, marginTop: 22 }}>
              {(total / 30).toFixed(1)}s · public/{src}
            </p>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: INK, opacity: o }}>
      <OffthreadVideo
        src={staticFile(src)}
        playbackRate={playbackRate}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

/** Lower-third caption over footage. */
const Caption: React.FC<{ kicker: string; line: string; delay?: number }> = ({ kicker, line, delay = 8 }) => {
  const frame = useCurrentFrame();
  const r = rise(frame, delay);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 78, fontFamily: SANS }}>
      <div style={{ opacity: r, transform: `translateY(${(1 - r) * 18}px)` }}>
        <div style={{
          display: 'inline-block', padding: '20px 30px', borderRadius: 14,
          background: 'rgba(7,9,15,0.86)', border: `1px solid ${LINE}`, backdropFilter: 'blur(8px)',
        }}>
          <p style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2.4, textTransform: 'uppercase', color: MODEL, margin: 0 }}>
            {kicker}
          </p>
          <p style={{ fontSize: 34, fontWeight: 600, color: TEXT, margin: '10px 0 0' }}>{line}</p>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Eyebrow: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = MODEL }) => (
  <p style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', color, margin: 0 }}>
    {children}
  </p>
);

/* ── scenes ─────────────────────────────────────────────────────────────── */

const Title: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 32 });
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', transform: `scale(${0.94 + s * 0.06})`, opacity: s }}>
          {/* The shipped wordmark, not typeset text - the video and the site should be the
              same brand, and a near-miss reads worse than no logo at all. */}
          <Img src={staticFile('brand/meritr-header.png')} style={{ width: 520, height: 'auto' }} />
          <p style={{ fontSize: 40, color: MUTED, margin: '30px 0 0', fontWeight: 400 }}>
            Prove the <span style={{ color: MODEL, fontWeight: 600 }}>history</span>.{' '}
            Keep the <span style={{ color: UP, fontWeight: 600 }}>collateral</span>.
          </p>
          <p style={{ fontFamily: MONO, fontSize: 16, color: DIM, marginTop: 34, letterSpacing: 1.5, opacity: rise(frame, 22) }}>
            AUTONOMOUS CREDIT ON CREDITCOIN
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** Amnesiac: a borrower's history fails to follow them across a gap. */
const Amnesiac: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const travel = interpolate(frame, [30, 74], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const reject = interpolate(frame, [78, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1360, opacity: rise(frame, 4) }}>
          <Eyebrow>the problem</Eyebrow>
          <p style={{ fontSize: 50, fontWeight: 600, color: TEXT, margin: '16px 0 60px' }}>
            Credit history does not travel.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
            <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 16, padding: 30, background: INK_800 }}>
              <Eyebrow color={UP}>ethereum</Eyebrow>
              <p style={{ fontSize: 30, color: TEXT, margin: '14px 0 6px', fontWeight: 600 }}>3 years of repayments</p>
              <p style={{ fontFamily: MONO, fontSize: 17, color: UP, margin: 0 }}>Aave V3 · flawless</p>
            </div>

            <div style={{ width: 300, position: 'relative', height: 6 }}>
              <div style={{ position: 'absolute', inset: 0, borderTop: `2px dashed ${LINE}` }} />
              <div style={{
                position: 'absolute', left: `${travel * 88}%`, top: -9,
                width: 22, height: 22, borderRadius: 11,
                background: reject > 0 ? DOWN : MODEL,
                boxShadow: `0 0 26px ${reject > 0 ? DOWN : MODEL}`,
                opacity: 1 - reject * 0.15,
              }} />
            </div>

            <div style={{
              flex: 1, border: `1px solid ${reject > 0 ? DOWN : LINE}`, borderRadius: 16, padding: 30,
              background: INK_800, transition: 'border-color 200ms',
            }}>
              <Eyebrow color={reject > 0 ? DOWN : DIM}>a new chain</Eyebrow>
              <p style={{ fontSize: 30, color: reject > 0 ? DOWN : TEXT, margin: '14px 0 6px', fontWeight: 600 }}>
                arrives a stranger
              </p>
              <p style={{ fontFamily: MONO, fontSize: 17, color: MUTED, margin: 0 }}>score 300 · 24% APR</p>
            </div>
          </div>

          <p style={{ fontSize: 23, color: MUTED, marginTop: 52, opacity: rise(frame, 96), lineHeight: 1.55 }}>
            The history is real. It is public. And no contract on the destination chain can verify
            it without trusting somebody to report it faithfully.
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** Brutal: every market answers distress the same way. */
const Brutal: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const markets = ['Aave', 'Compound', 'Maker', 'Morpho', 'Every other market'];
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1200, opacity: rise(frame, 4) }}>
          <Eyebrow color={DOWN}>and when it goes wrong</Eyebrow>
          <p style={{ fontSize: 50, fontWeight: 600, color: TEXT, margin: '16px 0 46px' }}>
            One answer, everywhere.
          </p>
          {markets.map((m, i) => {
            const r = rise(frame, 22 + i * 10, 14);
            return (
              <div key={m} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '19px 28px', marginBottom: 11, borderRadius: 12,
                border: `1px solid ${LINE}`, background: INK_800,
                opacity: r, transform: `translateX(${(1 - r) * -22}px)`,
              }}>
                <span style={{ fontSize: 27, color: i === markets.length - 1 ? MUTED : TEXT }}>{m}</span>
                <span style={{ fontFamily: MONO, fontSize: 23, color: DOWN, letterSpacing: 1 }}>LIQUIDATE</span>
              </div>
            );
          })}
          <p style={{ fontSize: 24, color: MUTED, marginTop: 40, opacity: rise(frame, 82) }}>
            Traditional finance restructures distressed debt every day. DeFi seizes it.
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** The proof pipeline: Ethereum tx -> precompile -> accepted. */
const ProofPipeline: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const steps = [
    { k: 'ETHEREUM MAINNET', v: 'Aave V3 repayment', m: '0x7db669…6e4a', c: MUTED },
    { k: 'PROOF BUILDER', v: 'Merkle inclusion + continuity', m: '7 siblings · 14 roots', c: MUTED },
    { k: 'PRECOMPILE 0x…0FD2', v: 'Creditcoin runtime verifies', m: 'not an oracle', c: MODEL },
    { k: 'MERITRATTESTOR', v: 'credit fact recorded', m: 'CreditFactAttested', c: UP },
  ];
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1280, opacity: rise(frame, 3) }}>
          <Eyebrow>how a fact gets in</Eyebrow>
          <p style={{ fontSize: 48, fontWeight: 600, color: TEXT, margin: '16px 0 50px' }}>
            The chain verifies it. Nobody reports it.
          </p>
          {steps.map((s, i) => {
            const r = rise(frame, 18 + i * 22, 16);
            return (
              <div key={s.k}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 26, padding: '22px 30px',
                  borderRadius: 14, border: `1px solid ${i === 2 ? MODEL : LINE}`,
                  background: i === 2 ? 'rgba(129,140,248,0.08)' : INK_800,
                  opacity: r, transform: `translateY(${(1 - r) * 16}px)`,
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: s.c, width: 250, letterSpacing: 1.4 }}>{s.k}</span>
                  <span style={{ fontSize: 27, color: TEXT, flex: 1, fontWeight: i === 2 ? 600 : 400 }}>{s.v}</span>
                  <span style={{ fontFamily: MONO, fontSize: 16, color: DIM }}>{s.m}</span>
                </div>
                {i < steps.length - 1 && (
                  <div style={{
                    width: 2, height: 22, background: LINE, margin: '0 auto',
                    opacity: rise(frame, 28 + i * 22, 10),
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** The tamper test: same proof, one byte changed, refused. */
const Tamper: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const good = rise(frame, 16, 14);
  const flip = rise(frame, 48, 10);
  const bad = rise(frame, 62, 14);
  const Row: React.FC<{ label: string; hexA: string; hexB: string; verdict: string; color: string; op: number; alt?: boolean }> =
    ({ label, hexA, hexB, verdict, color, op, alt }) => (
      <div style={{
        border: `1px solid ${op > 0.4 ? color : LINE}`, borderRadius: 14, padding: '26px 32px',
        background: INK_800, opacity: op, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 15, color: MUTED, letterSpacing: 1.2 }}>{label}</span>
          <span style={{ fontFamily: MONO, fontSize: 25, color, fontWeight: 500, letterSpacing: 1.5 }}>{verdict}</span>
        </div>
        <p style={{ fontFamily: MONO, fontSize: 19, color: DIM, margin: '16px 0 0', wordBreak: 'break-all' }}>
          {hexA}
          <span style={{
            color: alt ? DOWN : DIM,
            background: alt && flip > 0 ? 'rgba(251,113,133,0.18)' : 'transparent',
            padding: alt ? '2px 4px' : 0, borderRadius: 3,
          }}>{hexB}</span>
          …
        </p>
      </div>
    );
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1180, opacity: rise(frame, 2) }}>
          <Eyebrow color={UP}>the security claim, made checkable</Eyebrow>
          <p style={{ fontSize: 46, fontWeight: 600, color: TEXT, margin: '16px 0 44px' }}>
            Change one byte. The runtime refuses it.
          </p>
          <Row label="GENUINE PROOF" hexA="02f8b30182…a9f7c4" hexB="1b" verdict="ACCEPTED" color={UP} op={good} />
          <Row label="ONE BYTE ALTERED" hexA="02f8b30182…a9f7c4" hexB="1a" verdict="REJECTED" color={DOWN} op={bad} alt />
          <p style={{ fontFamily: MONO, fontSize: 17, color: MUTED, marginTop: 14, opacity: rise(frame, 76) }}>
            npm run verify:proof · a view call · no gas, no wallet, anyone can run it
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** Score sets the terms: 300 against 774. */
const ScoreTerms: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const Card: React.FC<{ score: string; tier: string; apr: string; ltv: string; accent: string; delay: number; sub: string }> =
    ({ score, tier, apr, ltv, accent, delay, sub }) => {
      const r = rise(frame, delay, 18);
      return (
        <div style={{
          flex: 1, border: `1px solid ${accent}55`, borderRadius: 18, padding: 36,
          background: INK_800, opacity: r, transform: `translateY(${(1 - r) * 22}px)`,
        }}>
          <p style={{ fontFamily: MONO, fontSize: 66, color: accent, margin: 0, fontWeight: 600 }}>{score}</p>
          <p style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 2, color: DIM, margin: '6px 0 4px' }}>{tier}</p>
          <p style={{ fontSize: 17, color: MUTED, margin: '0 0 26px' }}>{sub}</p>
          <div style={{ display: 'flex', gap: 34 }}>
            <div><p style={{ fontFamily: MONO, fontSize: 34, color: TEXT, margin: 0 }}>{apr}</p>
              <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.6, color: DIM, margin: '6px 0 0' }}>APR</p></div>
            <div><p style={{ fontFamily: MONO, fontSize: 34, color: TEXT, margin: 0 }}>{ltv}</p>
              <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.6, color: DIM, margin: '6px 0 0' }}>MAX LTV</p></div>
          </div>
        </div>
      );
    };
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1280, opacity: rise(frame, 3) }}>
          <Eyebrow>proven history sets the price</Eyebrow>
          <p style={{ fontSize: 48, fontWeight: 600, color: TEXT, margin: '16px 0 46px' }}>
            The score is not a badge. It is the terms.
          </p>
          <div style={{ display: 'flex', gap: 26 }}>
            <Card score="300" tier="BRONZE" sub="no proven history" apr="24.00%" ltv="30%" accent={DOWN} delay={16} />
            <Card score="774" tier="GOLD" sub="24 proven Aave facts" apr="8.20%" ltv="69.5%" accent={UP} delay={34} />
          </div>
          <p style={{ fontSize: 21, color: MUTED, marginTop: 42, opacity: rise(frame, 66) }}>
            Same protocol, same collateral. The difference is history the chain could verify.
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** The load-bearing signature. */
const Signature: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const strike = (i: number) => rise(frame, 44 + i * 9, 8);
  const nots = ['No rate.', 'No amount.', 'No score.', 'No signature over off-chain numbers.'];
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1240, opacity: rise(frame, 3) }}>
          <Eyebrow>the load-bearing decision</Eyebrow>
          <p style={{ fontSize: 46, fontWeight: 600, color: TEXT, margin: '16px 0 40px' }}>
            One argument. An address.
          </p>
          <div style={{
            border: `1px solid ${LINE}`, borderRadius: 16, background: INK_800,
            padding: '34px 40px', opacity: rise(frame, 16),
          }}>
            <p style={{ fontFamily: MONO, fontSize: 30, color: TEXT, margin: 0, lineHeight: 1.6 }}>
              function <span style={{ color: MODEL }}>restructure</span>(address borrower)
              <br />
              <span style={{ color: DIM }}>    external returns (uint256, uint256, uint256);</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 26, marginTop: 32, flexWrap: 'wrap' }}>
            {nots.map((n, i) => (
              <span key={n} style={{
                fontFamily: MONO, fontSize: 21, color: DOWN, opacity: strike(i),
                textDecoration: 'line-through', textDecorationColor: `${DOWN}88`,
              }}>{n}</span>
            ))}
          </div>
          <p style={{ fontSize: 32, color: TEXT, marginTop: 42, fontWeight: 600, opacity: rise(frame, 92) }}>
            The AI decides <span style={{ color: MODEL }}>whom</span>.
            The chain decides <span style={{ color: UP }}>how much</span>.
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** The agent's own log, typed out. */
const AgentLog: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const lines: Array<[string, string]> = [
    ['11:12:06', 'Book  3 position(s): healthy=1, stressed=2'],
    ['11:12:06', '  0xc5818BFB…  HF=1.079  score=300  debt=$2,744  STRESSED'],
    ['11:12:06', '  0x27e7c47f…  HF=1.079  score=300  debt=$6,586  STRESSED'],
    ['11:12:06', 'Triage: 2 position(s) actionable, ranked by loss averted.'],
    ['11:12:06', '  Restructuring 0x27e7c47f…: HF 1.079 -> 1.350, retiring 1321.01'],
    ['11:12:15', '  Confirmed: fc72b3449fd384a331bf…'],
    ['11:12:15', '  Restructuring 0xc5818BFB…: HF 1.079 -> 1.350, retiring 550.42'],
    ['11:12:30', '  Confirmed: 75bc20b274853f0e1f01…'],
  ];
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1420, opacity: rise(frame, 3) }}>
          <Eyebrow color={UP}>unattended · its own polling cycle</Eyebrow>
          <p style={{ fontSize: 44, fontWeight: 600, color: TEXT, margin: '16px 0 34px' }}>
            Nobody pressed anything.
          </p>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: '#05060A', padding: '28px 32px' }}>
            {lines.map(([t, l], i) => {
              const r = rise(frame, 14 + i * 13, 8);
              const done = l.includes('Confirmed');
              return (
                <p key={i} style={{
                  fontFamily: MONO, fontSize: 20, margin: '0 0 12px',
                  color: done ? UP : l.includes('STRESSED') ? WARN : MUTED,
                  opacity: r, whiteSpace: 'pre',
                }}>
                  <span style={{ color: DIM }}>{t}  </span>{l}
                </p>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** Who signed it - the claim a judge can check. */
const SignedBy: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1300, opacity: rise(frame, 3) }}>
          <Eyebrow color={UP}>verifiable, not asserted</Eyebrow>
          <p style={{ fontSize: 46, fontWeight: 600, color: TEXT, margin: '16px 0 44px' }}>
            Signed by the agent. Check <span style={{ fontFamily: MONO, color: MODEL }}>triggeredBy</span>.
          </p>
          <div style={{
            border: `1px solid ${UP}44`, borderRadius: 16, background: INK_800,
            padding: 34, opacity: rise(frame, 18),
          }}>
            <p style={{ fontFamily: MONO, fontSize: 22, color: MUTED, margin: 0 }}>
              triggeredBy <span style={{ color: UP }}>0xC06B60156473A15ED4505691403eEF1F7650a2A5</span>
            </p>
            <p style={{ fontFamily: MONO, fontSize: 17, color: DIM, margin: '14px 0 0' }}>
              holds RISK_AGENT_ROLE · and no other role on any Meritr contract
            </p>
            <p style={{ fontFamily: MONO, fontSize: 15, color: UP, margin: '10px 0 0' }}>
              every contract source-verified on Blockscout - read the code, not the bytecode
            </p>
          </div>
          <div style={{ display: 'flex', gap: 22, marginTop: 26 }}>
            {[['1.079 → 1.350', 'health factor', UP], [STATS.topRetiredUsd, 'debt retired', TEXT], ['$0', 'collateral seized', UP]].map(([a, b, c], i) => {
              const r = rise(frame, 40 + i * 11, 14);
              return (
                <div key={b as string} style={{
                  flex: 1, border: `1px solid ${LINE}`, borderRadius: 14, padding: 26,
                  background: INK_800, textAlign: 'center', opacity: r,
                }}>
                  <p style={{ fontFamily: MONO, fontSize: 32, color: c as string, margin: 0 }}>{a}</p>
                  <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.6, color: DIM, margin: '10px 0 0', textTransform: 'uppercase' }}>{b}</p>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** Never seized. */
const NeverSeized: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const s = spring({ frame: frame - 18, fps: 30, config: { damping: 200 }, durationInFrames: 26 });
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', width: 1180, opacity: rise(frame, 3) }}>
          <Eyebrow color={UP}>the whole point</Eyebrow>
          <p style={{ fontSize: 120, fontWeight: 700, color: UP, margin: '26px 0 0', transform: `scale(${0.9 + s * 0.1})` }}>
            0
          </p>
          <p style={{ fontSize: 38, color: TEXT, margin: '18px 0 0', fontWeight: 600 }}>
            Liquidation events, ever.
          </p>
          <p style={{ fontSize: 23, color: MUTED, margin: '26px auto 0', maxWidth: 860, lineHeight: 1.6, opacity: rise(frame, 46) }}>
            Restructuring has no code path that touches collateral. Every borrower kept every unit
            of what they posted - and the vault has never emitted a <span style={{ fontFamily: MONO, color: TEXT }}>Liquidated</span> event.
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** What a compromised agent key can and cannot do. */
const Safety: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const can = ['Trigger restructurings the protocol would already have approved'];
  const cannot = ['Invent a score', 'Grant itself a rate', 'Choose an amount', 'Drain the reserve'];
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 1300, opacity: rise(frame, 3) }}>
          <Eyebrow>why this is safe to point at user debt</Eyebrow>
          <p style={{ fontSize: 46, fontWeight: 600, color: TEXT, margin: '16px 0 44px' }}>
            Assume the agent key is stolen.
          </p>
          <div style={{ display: 'flex', gap: 26 }}>
            <div style={{
              flex: 1, border: `1px solid ${WARN}44`, borderRadius: 16, padding: 32,
              background: INK_800, opacity: rise(frame, 16, 16),
            }}>
              <Eyebrow color={WARN}>it can</Eyebrow>
              {can.map((c) => (
                <p key={c} style={{ fontSize: 23, color: TEXT, margin: '18px 0 0', lineHeight: 1.45 }}>{c}</p>
              ))}
            </div>
            <div style={{
              flex: 1, border: `1px solid ${UP}44`, borderRadius: 16, padding: 32,
              background: INK_800,
            }}>
              <Eyebrow color={UP}>it cannot</Eyebrow>
              {cannot.map((c, i) => (
                <p key={c} style={{
                  fontSize: 23, color: MUTED, margin: '16px 0 0', opacity: rise(frame, 28 + i * 10, 12),
                }}>
                  <span style={{ color: UP, fontFamily: MONO, marginRight: 12 }}>&#215;</span>{c}
                </p>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 21, color: MUTED, marginTop: 40, opacity: rise(frame, 78) }}>
            The agent is not a liveness dependency either - anyone may trigger the identical
            restructuring six hours after a position is flagged.
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

const Close: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const r = rise(frame, 6, 22);
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', opacity: r }}>
          <Img src={staticFile('brand/meritr-header.png')} style={{ width: 440, height: 'auto' }} />
          <p style={{ fontSize: 30, color: MUTED, margin: '26px 0 0' }}>
            Cross-chain credit a chain can verify. Distress a borrower can survive.
          </p>
          <p style={{ fontFamily: MONO, fontSize: 21, color: MODEL, marginTop: 40, opacity: rise(frame, 30) }}>
            usemeritr.vercel.app
          </p>
          <p style={{ fontFamily: MONO, fontSize: 15, color: DIM, marginTop: 16, letterSpacing: 1.4, opacity: rise(frame, 40) }}>
            CREDITCOIN TESTNET · ALL CONTRACTS SOURCE-VERIFIED · APACHE 2.0
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/* ── assembly ───────────────────────────────────────────────────────────── */

type Cut = { from: number; dur: number; el: React.ReactNode; vo?: string };

const F = 30;
const s = (n: number) => Math.round(n * F);

/**
 * The cut list, built once and used for both the render and the duration.
 *
 * These were two separate things - a sequence of add() calls, and a hand-summed constant - and
 * the constant silently lost a thirteen-second scene, which truncated the video without any
 * error. Deriving the length from the same list it renders makes that class of mistake
 * impossible rather than merely unlikely.
 */
const buildCuts = (): Cut[] => {
  let t = 0;
  const cuts: Cut[] = [];
  const add = (dur: number, el: React.ReactNode, vo?: string) => {
    cuts.push({ from: t, dur, vo, el });
    t += dur;
  };

  add(s(3.7), <Title total={s(3.7)} />, 'v00');
  add(s(15.1), <Amnesiac total={s(15.1)} />, 'v01');
  add(s(13.6), <Brutal total={s(13.6)} />, 'v02');
  add(s(15), <ProofPipeline total={s(15)} />, 'v03');

  // YOU RECORD: the terminal running `npm run verify:proof`.
  add(
    s(12.5),
    <>
      <Footage
        src="clips/verify.mp4" total={s(12.5)}
        label="Terminal: npm run verify:proof"
        note="Run it in the Meritr repo. Capture from the command to the ACCEPTED / REJECTED lines."
      />
      <Caption kicker="Anyone can run this" line="Genuine ACCEPTED. One byte altered, REJECTED." />
    </>,
    'v04',
  );
  // The landing page already renders these counters live, so show the real thing rather than
  // a rebuilt copy of it - and it is the one screen a reviewer will actually land on.
  add(
    s(15.3),
    <>
      <Footage
        src="clips/landing.mp4" total={s(15.3)} playbackRate={1.3}
        label="Landing page: scroll it"
        note="usemeritr.vercel.app - scroll from the hero through the evidence counters to the honest-limitations section. Slow and even; it plays at 1.3x."
      />
      <Caption kicker="Counted live from chain" line="Not a fixture. Real borrowers, proven." />
    </>,
    'v05',
  );
  add(s(15.8), <ScoreTerms total={s(15.8)} />, 'v06');

  // YOU RECORD: connect wallet, claim gas, open a loan.
  add(
    s(8.5),
    <>
      <Footage
        src="clips/wallet.mp4" total={s(8.5)} playbackRate={2.2}
        label="Wallet: connect → faucet → open a loan"
        note="usemeritr.vercel.app/app — connect MetaMask, request 1 CTC, mint demo tokens, then post 5 mWETH and draw 3,000 mUSD."
      />
      <Caption kicker="A borrower opens a line" line="Collateral posted. Terms set by proven history." />
    </>,
    'v07',
  );
  add(s(17.1), <Signature total={s(17.1)} />, 'v08');
  add(s(11.3), <Safety total={s(11.3)} />, 'v09');
  add(
    s(11),
    <Footage
      src="clips/agent.mp4" total={s(11)} playbackRate={1.4}
      label="Terminal: the agent's own log"
      note="ssh the VPS and run: journalctl -u meritr-agent -n 40 --no-pager. Show the triage and the two Confirmed lines. Falls back to the recreated log if you skip it."
      fallback={<AgentLog total={s(11)} />}
    />,
    'v10',
  );
  add(
    s(14.6),
    <Footage
      src="clips/explorer.mp4" total={s(14.6)} playbackRate={1.2}
      label="Blockscout: who signed it"
      note="Open tx 0xfc72b344… on creditcoin-testnet.blockscout.com and show the From address 0xC06B6015…. Falls back to the graphic if you skip it."
      fallback={<SignedBy total={s(14.6)} />}
    />,
    'v11',
  );

  // YOU RECORD: the console showing the restructurings.
  add(
    s(4),
    <>
      <Footage
        src="clips/console.mp4" total={s(4)} playbackRate={2}
        label="Console: the agent's record"
        note="usemeritr.vercel.app/app — the Agent view, showing the restructurings and the reasoning."
      />
      <Caption kicker="The public record" line="Four interventions. Zero seizures." />
    </>,
  );
  add(s(11.8), <NeverSeized total={s(11.8)} />, 'v12');
  add(s(9.7), <Close total={s(9.7)} />, 'v13');

  return cuts;
};

const CUTS = buildCuts();

export const MERITR_DURATION = CUTS.reduce((n, c) => n + c.dur, 0);

export const Meritr: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: INK }}>
    {CUTS.map((c, i) => (
      <Sequence key={i} from={c.from} durationInFrames={c.dur}>
        {c.el}
        {c.vo && PRESENT_VO.includes(`vo/${c.vo}.mp3`) ? (
          <Audio src={staticFile(`vo/${c.vo}.mp3`)} />
        ) : null}
      </Sequence>
    ))}
  </AbsoluteFill>
);

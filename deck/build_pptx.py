"""Build the deck as an editable .pptx, from the same content the PDF uses.

    .venv/bin/python deck/build_pptx.py

Google Slides imports this with the text still editable, which the PDF is not - so the deck can
be adjusted without a toolchain. Figures come from the live API for the same reason they do in
build.js: the relayer is still running, and a number typed into a slide is wrong within the hour.
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from datetime import date
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
API = "https://meritr.38.49.216.120.sslip.io"

INK = RGBColor(0x07, 0x09, 0x0F)
CARD = RGBColor(0x13, 0x18, 0x26)
TEXT = RGBColor(0xF7, 0xF8, 0xFB)
MUTED = RGBColor(0xA8, 0xB0, 0xBF)
DIM = RGBColor(0x5D, 0x64, 0x74)
MODEL = RGBColor(0x81, 0x8C, 0xF8)
UP = RGBColor(0x34, 0xD3, 0x99)
DOWN = RGBColor(0xFB, 0x71, 0x85)
WARN = RGBColor(0xF2, 0xC1, 0x4E)
TONES = {"up": UP, "down": DOWN, "warn": WARN, "model": MODEL}

SANS, MONO = "Inter", "Consolas"
W, H = Inches(13.333), Inches(7.5)
M = Inches(0.85)


def get(path: str):
    with urllib.request.urlopen(f"{API}{path}", timeout=60) as r:
        return json.load(r)


def usd(n: float) -> str:
    return f"${n/1e6:.1f}M" if n >= 1e6 else f"${round(n):,}"


def box(slide, x, y, w, h, fill=CARD, line=True):
    from pptx.enum.shapes import MSO_SHAPE

    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    if line:
        s.line.color.rgb = RGBColor(0x2A, 0x30, 0x3F)
        s.line.width = Pt(0.75)
    else:
        s.line.fill.background()
    s.shadow.inherit = False
    s.text_frame.clear()
    return s


def text(slide, x, y, w, h, runs, size=18, color=MUTED, font=SANS, bold=False,
         align=PP_ALIGN.LEFT, spacing=1.25):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    if isinstance(runs, str):
        runs = [(runs, color, bold)]
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = spacing
    for t, c, b in runs:
        r = p.add_run()
        r.text = t
        r.font.size = Pt(size)
        r.font.color.rgb = c
        r.font.name = font
        r.font.bold = b
    return tb


def bullets(slide, x, y, w, h, items, size=17, color=MUTED, font=SANS):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    for i, it in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = 1.35
        p.space_after = Pt(7)
        r = p.add_run()
        r.text = it
        r.font.size = Pt(size)
        r.font.color.rgb = color
        r.font.name = font
    return tb


def new_slide(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    bg = s.background.fill
    bg.solid()
    bg.fore_color.rgb = INK
    return s


def head(slide, eyebrow, title, n, total):
    text(slide, M, Inches(0.55), W - 2 * M, Inches(0.35), eyebrow.upper(),
         size=11, color=MODEL, font=MONO)
    text(slide, M, Inches(0.95), W - 2 * M, Inches(1.1), title,
         size=31, color=TEXT, bold=True, spacing=1.1)
    text(slide, W - Inches(1.9), H - Inches(0.62), Inches(1.1), Inches(0.3),
         f"{n:02d} / {total}", size=10, color=DIM, font=MONO, align=PP_ALIGN.RIGHT)


def note(slide, body):
    text(slide, M, H - Inches(1.62), W - 2 * M, Inches(1.0), body, size=13, color=MUTED, spacing=1.35)


def build() -> Path:
    att = get("/api/attestations")
    commits = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=ROOT,
                             capture_output=True, text=True).stdout.strip()
    V = {
        "FACTS": f"{att['facts']:,}",
        "BORROWERS": f"{att['borrowers']:,}",
        "VALUE": usd(att["valueProvenUsd"]),
        "COMMITS": commits,
        "DATE": date.today().isoformat(),
    }
    print(f"  {V['FACTS']} facts · {V['BORROWERS']} borrowers · {V['VALUE']} · {commits} commits")

    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H
    logo = ROOT / "public/brand/meritr-header.png"
    T = 14
    n = 0

    def nxt():
        nonlocal n
        n += 1
        return new_slide(prs)

    # 01 title
    s = nxt()
    s.shapes.add_picture(str(logo), M, Inches(2.05), width=Inches(3.6))
    text(s, M, Inches(1.55), Inches(8), Inches(0.3), "BUIDL CTC 2026 · AI / RWA",
         size=11, color=MODEL, font=MONO)
    text(s, M, Inches(2.95), Inches(10.5), Inches(1.6),
         "Prove the history. Keep the collateral.", size=40, color=TEXT, bold=True, spacing=1.08)
    text(s, M, Inches(4.5), Inches(9.2), Inches(0.9),
         "Autonomous DeAI debt restructuring and cross-chain credit memory, on Creditcoin.",
         size=17, color=MUTED)
    text(s, M, H - Inches(0.95), Inches(11), Inches(0.3),
         "usemeritr.vercel.app · github.com/mrnetwork0001/Meritr · Apache 2.0",
         size=10.5, color=DIM, font=MONO)

    # 02 problem
    s = nxt(); head(s, "the problem", "Onchain credit is amnesiac, and it is brutal.", n, T)
    cw = (W - 2 * M - Inches(0.35)) / 2
    for i, (h_, p_) in enumerate([
        ("Amnesiac", "A borrower with three years of flawless Aave repayments on Ethereum arrives on a new chain as a stranger. The history is real and public. No contract on the destination chain can verify it without trusting somebody to report it faithfully."),
        ("Brutal", "Every major lending market answers distress with exactly one action: liquidation. A temporary drawdown ends the borrower's equity, dumps collateral into a falling market, and pays a bonus to a bot. Traditional finance restructures distressed debt every day. DeFi seizes it."),
    ]):
        x = M + i * (cw + Inches(0.35))
        box(s, x, Inches(2.35), cw, Inches(2.9))
        text(s, x + Inches(0.35), Inches(2.6), cw - Inches(0.7), Inches(0.4), h_, size=19, color=TEXT, bold=True)
        text(s, x + Inches(0.35), Inches(3.15), cw - Inches(0.7), Inches(2.1), p_, size=13.5, color=MUTED)

    # 03 what it is
    s = nxt(); head(s, "what meritr is", "Credit a chain can verify. Distress a borrower can survive.", n, T)
    for i, (num, h_, p_) in enumerate([
        ("01", "Prove", "Read a borrower's real repayment, collateral and borrow history from Ethereum through Creditcoin's Attestcoin precompile - a Merkle-inclusion and continuity proof the runtime itself validates."),
        ("02", "Score", "Fold proven facts into a portable 300-900 score that sets the interest rate and borrowing capacity, recomputed onchain rather than supplied as an argument."),
        ("03", "Restructure", "When a position enters distress, an autonomous agent cuts the rate, extends the term and retires debt from a reserve instead of liquidating. The borrower keeps their collateral."),
    ]):
        y = Inches(2.3) + i * Inches(1.42)
        box(s, M, y, W - 2 * M, Inches(1.25))
        text(s, M + Inches(0.35), y + Inches(0.3), Inches(0.6), Inches(0.4), num, size=15, color=MODEL, font=MONO)
        text(s, M + Inches(1.0), y + Inches(0.27), Inches(1.7), Inches(0.4), h_, size=17, color=TEXT, bold=True)
        text(s, M + Inches(2.9), y + Inches(0.24), W - 2 * M - Inches(3.3), Inches(0.9), p_, size=13, color=MUTED)

    # 04 integration
    s = nxt(); head(s, "the integration", "Attestcoin is the only way a fact can enter.", n, T)
    for i, (k, v, m) in enumerate([
        ("ETHEREUM MAINNET", "Aave V3 repayment, supply, borrow", "chainKey 3"),
        ("PROOF BUILDER", "Merkle inclusion + continuity proof", "Creditcoin service"),
        ("PRECOMPILE 0x...0FD2", "the Creditcoin runtime verifies it", "not an oracle"),
        ("MERITRATTESTOR", "decoded against an onchain event schema", "CreditFactAttested"),
    ]):
        y = Inches(2.25) + i * Inches(0.88)
        box(s, M, y, W - 2 * M, Inches(0.72),
            fill=RGBColor(0x1A, 0x1E, 0x38) if i == 2 else CARD)
        text(s, M + Inches(0.3), y + Inches(0.2), Inches(2.6), Inches(0.35), k, size=10.5, color=MUTED, font=MONO)
        text(s, M + Inches(3.1), y + Inches(0.16), Inches(5.4), Inches(0.4), v, size=15, color=TEXT)
        text(s, W - M - Inches(2.6), y + Inches(0.2), Inches(2.3), Inches(0.35), m,
             size=11, color=DIM, font=MONO, align=PP_ALIGN.RIGHT)
    note(s, "MeritrAttestor inherits ASCBase and resolves chain keys from the ChainInfo precompile at 0x...0FD3 rather than hardcoding them - a wrong key fails silently, so deployment aborts on a mismatch. Remove Attestcoin and the protocol has no inputs at all.")

    # 05 tamper
    s = nxt(); head(s, "the security claim, made checkable", "Change one byte. The runtime refuses it.", n, T)
    for i, (l, r, tone) in enumerate([("GENUINE PROOF", "ACCEPTED", UP),
                                      ("ONE BYTE ALTERED", "REJECTED - Merkle proof validation failed", DOWN)]):
        y = Inches(2.5) + i * Inches(1.3)
        box(s, M, y, W - 2 * M, Inches(1.05))
        text(s, M + Inches(0.4), y + Inches(0.33), Inches(4), Inches(0.4), l, size=12.5, color=MUTED, font=MONO)
        text(s, W - M - Inches(7.2), y + Inches(0.28), Inches(6.8), Inches(0.5), r,
             size=17, color=tone, font=MONO, bold=True, align=PP_ALIGN.RIGHT)
    note(s, "npm run verify:proof - a view call against the live precompile. No gas, no wallet, no account. Anyone can run it, including a judge, against the deployed contracts. Nobody can insert a credit fact: not the team, not a key, not a committee.")

    # 06 evidence
    s = nxt(); head(s, "evidence", "Real borrowers. Not a fixture.", n, T)
    sw = (W - 2 * M - Inches(0.75)) / 4
    for i, (num, lab) in enumerate([(V["FACTS"], "credit facts proven"),
                                    (V["BORROWERS"], "real Ethereum borrowers"),
                                    (V["VALUE"], "of proven Aave activity"),
                                    ("0", "oracle operators")]):
        x = M + i * (sw + Inches(0.25))
        box(s, x, Inches(2.5), sw, Inches(1.85))
        text(s, x, Inches(2.85), sw, Inches(0.7), num, size=33, color=UP if i == 3 else TEXT,
             font=MONO, bold=True, align=PP_ALIGN.CENTER)
        text(s, x, Inches(3.65), sw, Inches(0.5), lab.upper(), size=9, color=DIM,
             font=MONO, align=PP_ALIGN.CENTER)
    note(s, "Counted from chain logs, not written down. A relayer holding no roles at all adds to this every four minutes, whether anyone is watching or not - a harder claim to fake than a recorded demo. Read live at /api/attestations.")
    return prs, V, T, nxt


def build_rest(prs, V, T, nxt) -> Path:
    n = len(prs.slides._sldIdLst)

    def head2(s, e, t):
        nonlocal n
        n += 1
        head(s, e, t, n, T)

    # 07 score sets the terms
    s = nxt(); head2(s, "why it matters", "The score is not a badge. It is the terms.")
    cw = (W - 2 * M - Inches(0.35)) / 2
    for i, (lab, sc, tier, apr, ltv, tone) in enumerate([
        ("NO PROVEN HISTORY", "300", "Bronze", "24.00%", "30%", DOWN),
        ("29 PROVEN AAVE FACTS", "785", "Platinum", "7.84%", "70.4%", UP),
    ]):
        x = M + i * (cw + Inches(0.35))
        box(s, x, Inches(2.3), cw, Inches(2.9))
        text(s, x + Inches(0.4), Inches(2.55), cw, Inches(0.3), lab, size=10.5, color=DIM, font=MONO)
        text(s, x + Inches(0.4), Inches(2.9), cw, Inches(0.9), sc, size=44, color=tone, font=MONO, bold=True)
        text(s, x + Inches(0.4), Inches(3.75), cw, Inches(0.3), tier.upper(), size=11, color=DIM, font=MONO)
        text(s, x + Inches(0.4), Inches(4.3), Inches(1.8), Inches(0.5), apr, size=21, color=TEXT, font=MONO)
        text(s, x + Inches(0.4), Inches(4.8), Inches(1.8), Inches(0.3), "APR", size=9, color=DIM, font=MONO)
        text(s, x + Inches(2.5), Inches(4.3), Inches(1.8), Inches(0.5), ltv, size=21, color=TEXT, font=MONO)
        text(s, x + Inches(2.5), Inches(4.8), Inches(1.8), Inches(0.3), "MAX LTV", size=9, color=DIM, font=MONO)
    note(s, "Same protocol, same collateral, same day. The only difference is history a chain could verify. That is the product.")

    # 08 the signature
    s = nxt(); head2(s, "the load-bearing decision", "restructure takes one argument: an address.")
    box(s, M, Inches(2.3), W - 2 * M, Inches(1.5))
    bullets(s, M + Inches(0.45), Inches(2.5), W - 2 * M - Inches(0.9), Inches(1.2), [
        "function restructure(address borrower)", "    external",
        "    returns (uint256, uint256, uint256);",
    ], size=16, color=TEXT, font=MONO)
    text(s, M, Inches(4.05), W - 2 * M, Inches(0.5),
         "No rate.     No amount.     No score.     No signature over off-chain numbers.",
         size=14, color=DOWN, font=MONO)
    note(s, "The vault re-reads the borrower's Attestcoin-derived score and recomputes every term through the same library the agent used. The AI decides whether and whom. The chain decides how much. A fully compromised agent key can trigger restructurings the protocol would already have approved, and nothing else.")

    # 09 autonomy
    s = nxt(); head2(s, "autonomy, demonstrated", "The agent found it, ranked it, and acted. Unattended.")
    box(s, M, Inches(2.25), W - 2 * M, Inches(2.5), fill=RGBColor(0x05, 0x06, 0x0A))
    bullets(s, M + Inches(0.4), Inches(2.45), W - 2 * M - Inches(0.8), Inches(2.2), [
        "Book  3 position(s): healthy=1, stressed=2",
        "Triage: 2 position(s) actionable, ranked by loss averted.",
        "  Restructuring 0x27e7c47f...: HF 1.079 -> 1.350, retiring 1321.01",
        "  Confirmed: 0xfc72b3449fd384a331bf...",
        "  Restructuring 0xc5818BFB...: HF 1.079 -> 1.350, retiring 550.42",
        "  Confirmed: 0x75bc20b274853f0e1f01...",
    ], size=12.5, color=MUTED, font=MONO)
    note(s, "Both transactions signed by 0xC06B6015..., a key holding RISK_AGENT_ROLE and no other role on any Meritr contract. Health factor 1.079 to 1.350 on both. No collateral seized - this vault has never emitted a Liquidated event. Check triggeredBy on either transaction.")

    # 10 trust model
    s = nxt(); head2(s, "trust model", "Assume the agent key is stolen.")
    for i, (h_, tone, items) in enumerate([
        ("It can", WARN, ["Trigger restructurings the protocol would already have approved"]),
        ("It cannot", UP, ["Invent a score", "Grant itself a rate", "Choose an amount",
                           "Drain the reserve", "Seize collateral"]),
    ]):
        x = M + i * (cw + Inches(0.35))
        box(s, x, Inches(2.3), cw, Inches(2.6))
        text(s, x + Inches(0.4), Inches(2.55), cw, Inches(0.4), h_, size=17, color=tone, bold=True)
        bullets(s, x + Inches(0.4), Inches(3.05), cw - Inches(0.8), Inches(1.8), items, size=13.5)
    note(s, "The agent is not a liveness dependency either: anyone may trigger the identical restructuring six hours after a position is flagged. agents/scoring.py mirrors CreditMath.sol to the wei, and 168 parity vectors generated from the deployed library assert it.")

    # 11 what is real
    s = nxt(); head2(s, "stated plainly", "What is real, and what is not.")
    rows = [
        ("Credit facts", "proof-verified - nobody can create one without the precompile", UP),
        ("The restructurings", "real onchain state, two of them agent-signed", UP),
        ("Contracts", "all five source-verified on Blockscout", UP),
        ("Collateral pricing", "governance-fed behind PRICE_ROLE - the single trusted input", WARN),
        ("Demo market tokens", "synthetic, open mint, worth nothing - and verified, so checkable", WARN),
        ("“ZK-Credit”", "a commitment scheme today, not a SNARK", WARN),
        ("Audit status", "unaudited. A CertiK audit is a prize, not a completed step", WARN),
    ]
    for i, (k, v, tone) in enumerate(rows):
        y = Inches(2.25) + i * Inches(0.42)
        text(s, M, y, Inches(3.1), Inches(0.35), k, size=13, color=TEXT, bold=True)
        text(s, M + Inches(3.2), y, W - 2 * M - Inches(3.2), Inches(0.35), v, size=13, color=tone)
    note(s, "The credit layer holds no reference to the market layer: grep -ci 'vault' on the attestor and passport returns 0. Swapping the demo market for real assets would leave every score unchanged.")

    # 12 pillars
    s = nxt(); head2(s, "judging criteria", "Against the five CEIP pillars.")
    for i, (h_, p_) in enumerate([
        ("Technical alignment", "Attestcoin is not decoration - it is the only input path. ASCBase, the 0x...0FD2 BlockProver, the 0x...0FD3 ChainInfo registry."),
        ("Market & technical relevance", "Cross-chain credit portability and restructuring-over-liquidation are live problems. The source data is real Aave V3 mainnet activity."),
        ("Product vision", "History should follow a borrower between chains; distress should be survivable. The passport makes the first portable, the vault the second real."),
        ("Execution capability", f"{V['COMMITS']} commits across the window, 50 Solidity and 39 Python tests, wei-level agent/contract parity, a written limitations section."),
        ("User-base expansion", f"Honest status: {V['BORROWERS']} proven borrowers have not opted in. A real distribution channel, but converting it is future work - not a shipped result."),
    ]):
        y = Inches(2.2) + i * Inches(0.82)
        text(s, M, y, Inches(3.5), Inches(0.4), h_, size=14, color=TEXT, bold=True)
        text(s, M + Inches(3.7), y - Inches(0.03), W - 2 * M - Inches(3.7), Inches(0.7), p_, size=12.5, color=MUTED)

    # 13 roadmap
    s = nxt(); head2(s, "what comes next", "From proven history to a credit market.")
    for i, (h_, p_) in enumerate([
        ("Real assets", "The vault's asset and collateral are immutable, so production means a fresh deployment against canonical stablecoins and a real price feed rather than PRICE_ROLE."),
        ("Writeability", "Creditcoin's write path is in final development. When it ships, a restructuring decided here can settle on the source chain."),
        ("The SNARK", "factsCommitment is the intended substitution point: prove a score band without publishing the facts behind it."),
        (f"Onboarding the proven", f"{V['BORROWERS']} addresses already carry standing here. Reaching them is the go-to-market."),
    ]):
        y = Inches(2.3) + i * Inches(1.05)
        box(s, M, y, W - 2 * M, Inches(0.9))
        text(s, M + Inches(0.35), y + Inches(0.18), Inches(3.2), Inches(0.4), h_, size=15, color=TEXT, bold=True)
        text(s, M + Inches(3.8), y + Inches(0.15), W - 2 * M - Inches(4.2), Inches(0.65), p_, size=12.5, color=MUTED)

    # 14 close
    s = nxt()
    logo = ROOT / "public/brand/meritr-header.png"
    s.shapes.add_picture(str(logo), (W - Inches(4.2)) / 2, Inches(1.9), width=Inches(4.2))
    text(s, M, Inches(3.15), W - 2 * M, Inches(0.5),
         "Cross-chain credit a chain can verify. Distress a borrower can survive.",
         size=18, color=MUTED, align=PP_ALIGN.CENTER)
    for i, (k, v) in enumerate([
        ("Live console", "usemeritr.vercel.app"),
        ("Source", "github.com/mrnetwork0001/Meritr"),
        ("Risk API", "meritr.38.49.216.120.sslip.io/api/attestations"),
        ("MeritrVault", "0x233D2aE279230fBFFbe61e6dF2A9DC6bF6ff3e84"),
    ]):
        y = Inches(4.05) + i * Inches(0.4)
        text(s, Inches(3.1), y, Inches(2.4), Inches(0.35), k, size=11, color=DIM, font=MONO, align=PP_ALIGN.RIGHT)
        text(s, Inches(5.8), y, Inches(5.5), Inches(0.35), v, size=12.5, color=MODEL, font=MONO)
    text(s, M, H - Inches(0.85), W - 2 * M, Inches(0.35),
         f"Creditcoin CC3 testnet, chain 102031 - Attestcoin precompile 0x...0FD2 - figures read from chain on {V['DATE']}",
         size=9.5, color=DIM, font=MONO, align=PP_ALIGN.CENTER)

    out = ROOT / "public" / "meritr-deck.pptx"
    prs.save(out)
    return out


if __name__ == "__main__":
    prs, V, T, nxt = build()
    out = build_rest(prs, V, T, nxt)
    print(f"  {len(prs.slides._sldIdLst)} slides -> {out.relative_to(ROOT)} ({out.stat().st_size/1024:.0f} KB)")

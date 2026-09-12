/**
 * Build the Meritr deck: live figures -> HTML -> PDF.
 *
 *   node deck/build.js
 *
 * Writes public/deck.pdf, so the deployed console serves it at /deck.pdf and the submission
 * has a stable URL on the project's own domain rather than a file-sharing link.
 *
 * The figures come from the live API at build time. Nothing is typed in: the relayer is still
 * running, and a deck that hardcodes its own evidence is wrong within the hour - the same
 * mistake the README made before it was corrected.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const API = process.env.MERITR_API || "https://meritr.38.49.216.120.sslip.io";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString("en-US")}`);

/* ── layout ─────────────────────────────────────────────────────────────── */

const CSS = `
@page { size: 1600px 900px; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #07090F; }
body { font-family: Inter, -apple-system, "Helvetica Neue", Arial, sans-serif; }
.slide {
  width: 1600px; height: 900px; position: relative; overflow: hidden;
  background: #07090F; color: #F7F8FB; padding: 78px 96px;
  page-break-after: always; break-after: page; display: flex; flex-direction: column;
  background-image: radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px);
  background-size: 34px 34px;
}
.slide:last-child { page-break-after: auto; }
.eyebrow { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; letter-spacing: 3px;
  text-transform: uppercase; color: #818CF8; margin: 0 0 18px; }
h1 { font-size: 52px; line-height: 1.12; font-weight: 650; margin: 0 0 34px; letter-spacing: -0.8px; max-width: 1180px; }
.note { font-size: 17.5px; line-height: 1.62; color: #8B93A5; margin-top: auto; padding-top: 26px;
  border-top: 1px solid rgba(255,255,255,0.09); max-width: 1330px; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.pn { position: absolute; right: 96px; bottom: 44px; font-family: ui-monospace, Menlo, monospace;
  font-size: 12.5px; color: #454C5C; letter-spacing: 1px; }
.card { border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; background: #131826; padding: 30px 32px; }
.up { color: #34D399 } .down { color: #FB7185 } .warn { color: #F2C14E } .model { color: #818CF8 }
.dim { color: #5D6474 }
/* title */
.title-slide { align-items: flex-start; justify-content: center; }
.title-slide h1 { font-size: 72px; margin: 26px 0 22px; }
.wordmark { height: 62px; width: auto; }
.lead { font-size: 25px; color: #8B93A5; line-height: 1.5; max-width: 900px; margin: 0; }
.foot { position: absolute; left: 96px; bottom: 58px; font-family: ui-monospace, Menlo, monospace;
  font-size: 14px; color: #5D6474; letter-spacing: 0.6px; }
/* generic grids */
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
.two h3, .cols2 h3 { font-size: 23px; margin: 0 0 14px; font-weight: 620; }
.two p { font-size: 18.5px; line-height: 1.6; color: #A8B0BF; margin: 0; }
.steps { display: grid; gap: 16px; }
.step { display: grid; grid-template-columns: 62px 190px 1fr; gap: 24px; align-items: start;
  border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; background: #131826; padding: 24px 28px; }
.step .n { font-family: ui-monospace, Menlo, monospace; font-size: 20px; color: #818CF8; }
.step .h { font-size: 22px; font-weight: 620; }
.step .p { font-size: 17.5px; line-height: 1.58; color: #A8B0BF; }
.pipe { display: grid; gap: 12px; }
.pipe .row { display: grid; grid-template-columns: 300px 1fr 250px; gap: 22px; align-items: center;
  border: 1px solid rgba(255,255,255,0.09); border-radius: 13px; background: #131826; padding: 20px 28px; }
.pipe .row.hi { border-color: #818CF8; background: rgba(129,140,248,0.09); }
.pipe .k { font-family: ui-monospace, Menlo, monospace; font-size: 14px; letter-spacing: 1.4px; color: #8B93A5; }
.pipe .v { font-size: 21px; }
.pipe .m { font-family: ui-monospace, Menlo, monospace; font-size: 15px; color: #5D6474; text-align: right; }
.verdict { display: grid; gap: 18px; }
.verdict .row { display: flex; justify-content: space-between; align-items: center;
  border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; background: #131826; padding: 30px 34px; }
.verdict .l { font-family: ui-monospace, Menlo, monospace; font-size: 16px; letter-spacing: 1.4px; color: #8B93A5; }
.verdict .r { font-family: ui-monospace, Menlo, monospace; font-size: 24px; font-weight: 600; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.stats .s { border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; background: #131826;
  padding: 40px 22px; text-align: center; }
.stats .n { font-family: ui-monospace, Menlo, monospace; font-size: 50px; font-weight: 600; margin: 0; }
.stats .l { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; letter-spacing: 1.5px;
  text-transform: uppercase; color: #5D6474; margin: 14px 0 0; }
.cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
.cmp .c { border-radius: 18px; background: #131826; padding: 34px 36px; border: 1px solid rgba(255,255,255,0.09); }
.cmp .lab { font-family: ui-monospace, Menlo, monospace; font-size: 13px; letter-spacing: 1.8px; color: #5D6474; }
.cmp .sc { font-family: ui-monospace, Menlo, monospace; font-size: 66px; font-weight: 650; margin: 10px 0 2px; }
.cmp .ti { font-family: ui-monospace, Menlo, monospace; font-size: 15px; color: #5D6474; letter-spacing: 1.5px; }
.cmp .row { display: flex; gap: 44px; margin-top: 26px; }
.cmp .k { font-family: ui-monospace, Menlo, monospace; font-size: 32px; }
.cmp .kk { font-family: ui-monospace, Menlo, monospace; font-size: 12px; letter-spacing: 1.6px; color: #5D6474; margin-top: 6px; }
pre.code { font-family: ui-monospace, Menlo, monospace; font-size: 25px; line-height: 1.62; color: #F7F8FB;
  border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; background: #131826; padding: 30px 34px; margin: 0 0 24px; }
.strike { display: flex; gap: 30px; flex-wrap: wrap; }
.strike span { font-family: ui-monospace, Menlo, monospace; font-size: 20px; color: #FB7185;
  text-decoration: line-through; text-decoration-color: rgba(251,113,133,0.55); }
pre.log { font-family: ui-monospace, Menlo, monospace; font-size: 19px; line-height: 1.85; color: #8B93A5;
  border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; background: #05060A; padding: 26px 30px; margin: 0; }
pre.log .ok { color: #34D399 } pre.log .st { color: #F2C14E }
.cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
.cols2 ul { margin: 0; padding: 0; list-style: none; }
.cols2 li { font-size: 19.5px; line-height: 1.5; color: #A8B0BF; margin-top: 14px; }
table.t { width: 100%; border-collapse: collapse; }
table.t td { padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.09); font-size: 18.5px; vertical-align: top; }
table.t td:first-child { width: 290px; color: #F7F8FB; font-weight: 560; }
table.t td:last-child { color: #A8B0BF; }
.pillars { display: grid; gap: 13px; }
.pillar { display: grid; grid-template-columns: 330px 1fr; gap: 26px; align-items: start;
  border-bottom: 1px solid rgba(255,255,255,0.09); padding-bottom: 13px; }
.pillar .h { font-size: 20px; font-weight: 620; }
.pillar .p { font-size: 17.5px; line-height: 1.55; color: #A8B0BF; }
.close-slide { align-items: center; justify-content: center; text-align: center; }
.close-slide .wordmark { height: 72px; margin-bottom: 26px; }
.links { display: grid; grid-template-columns: repeat(2, auto); gap: 16px 64px; margin-top: 40px; justify-content: center; }
.links .k { font-family: ui-monospace, Menlo, monospace; font-size: 14px; color: #5D6474; text-align: right; }
.links .v { font-family: ui-monospace, Menlo, monospace; font-size: 17px; color: #818CF8; text-align: left; }
`;

const tone = (t) => (t === "up" ? "up" : t === "down" ? "down" : t === "warn" ? "warn" : "");

function render(s, i, total, logo) {
  const pn = `<div class="pn">${String(i + 1).padStart(2, "0")} / ${total}</div>`;
  if (s.kind === "title") {
    return `<section class="slide title-slide">
      <img class="wordmark" src="${logo}"/>
      <p class="eyebrow" style="margin-top:34px">${esc(s.eyebrow)}</p>
      <h1>${s.title}</h1>
      <p class="lead">${esc(s.sub)}</p>
      <div class="foot">${esc(s.foot)}</div>${pn}</section>`;
  }
  if (s.kind === "close") {
    return `<section class="slide close-slide">
      <img class="wordmark" src="${logo}"/>
      <p class="lead" style="text-align:center">${esc(s.sub)}</p>
      <div class="links">${s.links.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`).join("")}</div>
      <div class="foot" style="left:0;right:0;text-align:center">${esc(s.foot)}</div>${pn}</section>`;
  }
  let body = "";
  if (s.cols) body = `<div class="two">${s.cols.map((c) => `<div class="card"><h3>${esc(c.h)}</h3><p>${esc(c.p)}</p></div>`).join("")}</div>`;
  if (s.steps) body = `<div class="steps">${s.steps.map(([n, h, p]) => `<div class="step"><div class="n">${n}</div><div class="h">${esc(h)}</div><div class="p">${esc(p)}</div></div>`).join("")}</div>`;
  if (s.pipeline) body = `<div class="pipe">${s.pipeline.map(([k, v, m], j) => `<div class="row${j === 2 ? " hi" : ""}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="m">${esc(m)}</div></div>`).join("")}</div>`;
  if (s.verdicts) body = `<div class="verdict">${s.verdicts.map(([l, r, t]) => `<div class="row"><div class="l">${esc(l)}</div><div class="r ${tone(t)}">${esc(r)}</div></div>`).join("")}</div>`;
  if (s.stats) body = `<div class="stats">${s.stats.map(([n, l], j) => `<div class="s"><p class="n${j === 3 ? " up" : ""}">${esc(n)}</p><p class="l">${esc(l)}</p></div>`).join("")}</div>`;
  if (s.compare) body = `<div class="cmp">${s.compare.map((c) => `<div class="c" style="border-color:${c.tone === "up" ? "rgba(52,211,153,0.35)" : "rgba(251,113,133,0.35)"}"><div class="lab">${esc(c.label)}</div><div class="sc ${tone(c.tone)}">${esc(c.score)}</div><div class="ti">${esc(c.tier)}</div><div class="row"><div><div class="k">${esc(c.apr)}</div><div class="kk">APR</div></div><div><div class="k">${esc(c.ltv)}</div><div class="kk">MAX LTV</div></div></div></div>`).join("")}</div>`;
  if (s.code) body = `<pre class="code">${esc(s.code).replace("restructure", '<span class="model">restructure</span>')}</pre><div class="strike">${s.strike.map((x) => `<span>${esc(x)}</span>`).join("")}</div>`;
  if (s.log) body = `<pre class="log">${s.log.map((l) => (l.includes("Confirmed") ? `<span class="ok">${esc(l)}</span>` : l.includes("stressed") ? `<span class="st">${esc(l)}</span>` : esc(l))).join("\n")}</pre>`;
  if (s.cols2) body = `<div class="cols2">${s.cols2.map((c) => `<div class="card"><h3 class="${tone(c.tone)}">${esc(c.h)}</h3><ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div>`;
  if (s.table) body = `<table class="t">${s.table.map(([k, v, t]) => `<tr><td>${esc(k)}</td><td class="${tone(t)}">${esc(v)}</td></tr>`).join("")}</table>`;
  if (s.pillars) body = `<div class="pillars">${s.pillars.map(([h, p]) => `<div class="pillar"><div class="h">${esc(h)}</div><div class="p">${esc(p)}</div></div>`).join("")}</div>`;
  if (s.next) body = `<div class="steps">${s.next.map(([h, p]) => `<div class="step" style="grid-template-columns:330px 1fr"><div class="h">${esc(h)}</div><div class="p">${esc(p)}</div></div>`).join("")}</div>`;
  return `<section class="slide"><p class="eyebrow">${esc(s.eyebrow)}</p><h1>${s.title}</h1>${body}${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}${pn}</section>`;
}

(async () => {
  const [att, res] = await Promise.all([
    fetch(`${API}/api/attestations`).then((r) => r.json()),
    fetch(`${API}/api/restructurings`).then((r) => r.json()),
  ]);
  const commits = execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: ROOT }).toString().trim();
  const vals = {
    FACTS: att.facts.toLocaleString("en-US"),
    BORROWERS: att.borrowers.toLocaleString("en-US"),
    VALUE: usd(att.valueProvenUsd),
    COMMITS: commits,
    DATE: new Date().toISOString().slice(0, 10),
  };
  console.log(`  ${vals.FACTS} facts · ${vals.BORROWERS} borrowers · ${vals.VALUE} · ${commits} commits`);

  const logo = "data:image/png;base64," + fs.readFileSync(path.join(ROOT, "public/brand/meritr-header.png")).toString("base64");
  const slides = require("./slides.js")(vals);
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Meritr</title><style>${CSS}</style></head><body>${slides
    .map((s, i) => render(s, i, slides.length, logo))
    .join("\n")}</body></html>`;
  for (const [k, v] of Object.entries(vals)) html = html.split(`{{${k}}}`).join(v);

  const htmlPath = path.join(__dirname, "deck.html");
  fs.writeFileSync(htmlPath, html);
  const out = path.join(ROOT, "public/deck.pdf");
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
    `--print-to-pdf=${out}`, "--virtual-time-budget=8000", `file://${htmlPath}`,
  ], { stdio: "pipe" });
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`  ${slides.length} slides -> public/deck.pdf (${kb} KB)`);
})();

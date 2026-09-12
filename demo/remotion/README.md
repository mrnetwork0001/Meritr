# Meritr demo video

The composition that produces `meritr-demo.mp4` — **171.5 seconds**, 1920x1080, 30fps.
Comfortably inside the hackathon's three-minute ceiling.

Screen recordings and rendered output are **not** in this repository. They are binary that
every clone would otherwise pay for, and none of it is readable. What is here is the part
worth reading: the composition, the narration script, and the manifest.

## What you record

Six clips. Everything else is motion graphics and renders without you.

Until a clip exists the composition draws a labelled placeholder of exactly the right length,
so the video always renders - you can watch the whole thing before recording anything, and drop
the captures in as you make them. The last two are different: if you skip them, a motion-graphic
recreation carries the scene instead. Real footage is simply more convincing where the real
thing exists.

| clip | slot | what to capture |
| --- | --- | --- |
| `landing.mp4` | 15.3s | `usemeritr.vercel.app` - scroll from the hero through the evidence counters to the honest-limitations section. Slow and even; plays at 1.3x, so about 20s of capture. |
| `verify.mp4` | 12.5s | A terminal in the repo root running `npm run verify:proof`. Start on the command; end on the `ACCEPTED` / `REJECTED` lines. |
| `wallet.mp4` | 8.5s | `usemeritr.vercel.app/app` - connect MetaMask, request 1 CTC from the faucet, mint demo tokens, then post 5 mWETH and draw 3,000 mUSD. Plays at 2.2x, so about 19s of capture. |
| `console.mp4` | 4s | The Agent view of the console, showing the restructurings. Plays at 2x. |
| `agent.mp4` | 11s | *optional* - `journalctl -u meritr-agent -n 40 --no-pager` on the VPS, showing the triage and the two `Confirmed` lines. Falls back to a recreated log. |
| `explorer.mp4` | 14.6s | *optional* - tx `0xfc72b344…` on Blockscout, showing the From address `0xC06B6015…`. Falls back to a graphic. |

Put them in `public/clips/`. `sync-clips.js` runs before every render and picks them up.

## Narration

Regenerates from source — `vo-gen.js` holds the exact script, fourteen sections.

```bash
export ELEVENLABS_API_KEY=...
node vo-gen.js && node vo-add.js
```

`vo-add.js` copies the mp3s where Remotion can reach them and prints each one's duration, so
the scene lengths in `src/Meritr.tsx` can be checked against the audio that will actually play.
If a section runs long, adjust that scene's `add(s(...))` rather than cutting the sentence.

## Numbers

**Do not type a figure into the composition.** The relayer is still running, so anything
written down is wrong within the hour — the same reason the landing page counts from chain.

```bash
node fetch-stats.js     # writes src/stats.ts from the live API
```

This runs automatically before a render. Re-read `vo-gen.js` against it before regenerating the
narration: the spoken figures are written out in words and cannot update themselves.

## Render

```bash
npm ci
npm run render          # 1920x1080, CRF 16
npm run render:1440     # 2880x1620  <- submit this one
npm run render:4k       # 3840x2160
npm run studio          # or preview scene by scene
```

Each target syncs the clip manifest and refreshes the live figures first.

**Which to submit.** `render:1440` at 2880x1620, about 10 MB. Eleven of the fourteen scenes are
vector text and motion graphics, and those are resolution-independent - rendering above 1080p
makes them visibly crisper rather than merely larger, which is why the scale flag is worth more
here than a higher bitrate would be. 4K is available and looks marginally better again, but the
file is several times the size for a difference most reviewers will not see on a laptop.

## Structure

Fourteen cuts. The argument runs problem → proof → evidence → mechanism → autonomy → outcome.

| # | scene | s | vo |
| --- | --- | --- | --- |
| 1 | Title — the wordmark | 3.7 | v00 |
| 2 | Amnesiac — history does not travel | 15.1 | v01 |
| 3 | Proof pipeline — how a fact gets in | 15 | v03 |
| 4 | **verify.mp4** — accepted, then refused | 12.5 | v04 |
| 5 | **landing.mp4** — the page, counting live | 15.3 | v05 |
| 6 | Score sets the terms — 300 against 774 | 15.8 | v06 |
| 7 | **wallet.mp4** — a borrower opens a line | 20 | v07 |
| 8 | The signature — one argument | 17.1 | v08 |
| 9 | Safety — assume the key is stolen | 11.3 | v09 |
| 10 | **agent.mp4** or the recreated log | 11 | v10 |
| 11 | **explorer.mp4** — who signed it | 14.6 | v11 |
| 12 | **console.mp4** — the public record | 4 | — |
| 13 | Never seized | 11.8 | v12 |
| 14 | Close — the wordmark again | 9.7 | v13 |

Fourteen cuts, 176.9 seconds. `npm run check` verifies every scene is at least as long as the
narration it carries and that the total stays under three minutes; it runs before every render.

**The wallet clip plays at 1:1.** It is the one scene showing real transactions being signed, so
it is never sped up - the "Brutal" scene was cut to buy it the runtime, and its narration (v02)
is kept in `vo-gen.js` in case the argument wants it back.

**Master at 1080p, not 1440p.** The recordings are native 1920x1080, so mastering above that
would upscale the footage - softening the one content a reviewer looks hardest at - to sharpen
graphics that are already crisp. CRF 12. `render:1440` remains if the balance ever changes.

**One thing to know before re-cutting.** Scenes 11 and 12 name the agent address
`0xC06B6015…` and the two transactions it signed. Those are real and checkable — a judge who
reads `triggeredBy` on either one finds a key holding `RISK_AGENT_ROLE` and no other role.
That is the single most load-bearing claim in the video, so if the figures are ever refreshed,
refresh them from `/api/restructurings` rather than editing the text.

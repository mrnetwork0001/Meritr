# Meritr demo video

The composition that produces `meritr-demo.mp4` — **171.5 seconds**, 1920x1080, 30fps.
Comfortably inside the hackathon's three-minute ceiling.

Screen recordings and rendered output are **not** in this repository. They are binary that
every clone would otherwise pay for, and none of it is readable. What is here is the part
worth reading: the composition, the narration script, and the manifest.

## What you record

Three clips. Everything else is motion graphics and renders without you.

Until a clip exists the composition draws a labelled placeholder of exactly the right length,
so the video always renders — you can watch the whole thing before recording anything, and
drop the captures in as you make them.

| clip | length | what to capture |
| --- | --- | --- |
| `verify.mp4` | 11s | A terminal in the repo root running `npm run verify:proof`. Start on the command; end on the `ACCEPTED` / `REJECTED` lines. |
| `wallet.mp4` | 13s | `usemeritr.vercel.app/app` — connect MetaMask, request 1 CTC from the faucet, mint demo tokens, then post 5 mWETH and draw 3,000 mUSD. Rendered at 1.6x, so work at a natural pace. |
| `console.mp4` | 9s | The Agent view of the console, showing the four restructurings and the agent's reasoning. Rendered at 1.2x. |

**Record at Retina resolution, not 1920x1080.** The composition renders at 1.5x or 2x (below),
which sharpens every vector scene - but footage can only be as sharp as its source, so a 1080p
capture is the one thing that would look soft in a 1440p or 4K master. macOS captures a Retina
display at 2x natively; keep that and scale down at cut time rather than recording small.

One continuous capture is easiest; cut it afterwards. Match the master you intend to render:

```bash
# for the 1440p master
ffmpeg -ss <from> -i capture.mov -t <seconds> \
  -vf "scale=2880:1620:flags=lanczos,fps=30" -an \
  -c:v libx264 -crf 16 -pix_fmt yuv420p public/clips/<name>.mp4
```

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
| 1 | Title | 5.5 | v00 |
| 2 | Amnesiac — history does not travel | 15 | v01 |
| 3 | Brutal — one answer, everywhere | 12 | v02 |
| 4 | Proof pipeline — how a fact gets in | 15 | v03 |
| 5 | **verify.mp4** — accepted, then refused | 11 | v04 |
| 6 | Evidence — live counters | 13 | v05 |
| 7 | Score sets the terms — 300 against 774 | 13 | v06 |
| 8 | **wallet.mp4** — a borrower opens a line | 13 | v07 |
| 9 | The signature — one argument | 16 | v08 |
| 10 | Safety — assume the key is stolen | 11 | v09 |
| 11 | Agent log — nobody pressed anything | 15 | v10 |
| 12 | Signed by — check `triggeredBy` | 14 | v11 |
| 13 | **console.mp4** — the public record | 9 | — |
| 14 | Never seized, then close | 22 | v12, v13 |

**One thing to know before re-cutting.** Scenes 11 and 12 name the agent address
`0xC06B6015…` and the two transactions it signed. Those are real and checkable — a judge who
reads `triggeredBy` on either one finds a key holding `RISK_AGENT_ROLE` and no other role.
That is the single most load-bearing claim in the video, so if the figures are ever refreshed,
refresh them from `/api/restructurings` rather than editing the text.

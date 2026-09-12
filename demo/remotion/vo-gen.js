// Generates the narration with ElevenLabs.
//   export ELEVENLABS_API_KEY=...  &&  node vo-gen.js
// Voice matches the one used across these project videos.
const fs = require('fs');
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('Set ELEVENLABS_API_KEY'); process.exit(1); }
const VOICE = process.env.ELEVENLABS_VOICE || 'CwhRBWXzGAHq8TQ4Fs17';
const MODEL = 'eleven_multilingual_v2';

// Every number here is read from chain at the time of writing and is checkable.
// Re-read them before re-rendering: the relayer is still running.
const SECTIONS = [
  ['00', "Meritr. Prove the history. Keep the collateral."],
  ['01', "Onchain credit is amnesiac. A borrower with three years of flawless Aave repayments arrives on a new chain as a stranger. Their history is real and public, and no contract there can verify it without trusting somebody to report it."],
  // v02 is unused: the scene it narrated was cut to give the wallet footage room to play at
  // real speed. Kept because the argument may want it back.
  ['02', "And when that borrower falls behind, every major lending market answers with exactly one action. Liquidation. Traditional finance restructures distressed debt every day. DeFi seizes it."],
  ['03', "Meritr reads the history through Attestcoin, Creditcoin's native query verifier. A real Aave repayment on Ethereum mainnet, a Merkle inclusion proof, and a precompile inside the Creditcoin runtime that decides whether it is true."],
  ['04', "Change one byte of that transaction and the runtime refuses it. Nobody can insert a credit fact. Not the team, not a key, not a committee. Only a proof the chain itself accepts."],
  ['05', "Nearly three hundred proven facts, from more than a hundred and twenty real Ethereum borrowers, carrying thirty five million dollars of Aave activity. A relayer holding no roles adds to it every four minutes, whether anyone is watching or not."],
  ['06', "Those facts fold into a score, and the score sets the terms. No proven history means twenty four percent, against thirty percent of your collateral. A score of seven hundred and seventy four means eight point two percent, against sixty nine."],
  ['07', "A wallet arriving with nothing. Creditcoin's testnet faucet lives in Discord, so Meritr dispenses its own: sign a message, which costs no gas, and the protocol sends the CTC. Then collateral goes in and the draw comes out, at the rate this address has earned. Every step is a real transaction."],
  ['08', "The whole design rests on one signature. Restructure takes an address. No rate, no amount, no score. The vault re-reads the borrower's proven score and recomputes every term itself. The AI decides whom. The chain decides how much."],
  ['09', "So a fully compromised agent key can trigger restructurings the protocol would already have approved, and nothing else. It cannot invent a score, grant itself a rate, or drain the reserve."],
  ['10', "This is the agent running unattended on its own polling cycle. It found two stressed positions, ranked them by the loss each intervention would avert, and took the larger one first."],
  ['11', "Both were signed by a key holding the risk agent role and nothing else. Health factor one point zero seven nine, to one point three five. Thirteen hundred dollars of debt retired, then five hundred and fifty. Check triggered-by on either one."],
  ['12', "And no collateral moved. Restructuring has no code path that touches it. This vault has never emitted a liquidation event, and the borrowers kept every unit of what they posted."],
  ['13', "Meritr. Cross-chain credit a chain can verify, and distress a borrower can survive. Every contract source-verified on Creditcoin testnet."],
];

const total = SECTIONS.reduce((n, s) => n + s[1].length, 0);
console.log('characters to generate:', total);

(async () => {
  for (const [id, text] of SECTIONS) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true } }),
    });
    if (!res.ok) { console.error(id, 'FAILED', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
    fs.writeFileSync(`vo/v${id}.mp3`, Buffer.from(await res.arrayBuffer()));
    console.log(id, 'ok', text.length, 'chars');
  }
})();

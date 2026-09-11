/**
 * Client for Creditcoin's Attestcoin proof-builder service.
 *
 * This is the piece that turns Meritr's Attestcoin integration from "correctly shaped" into
 * "actually exercised". The contract path was always real — MeritrAttestor inherits ASCBase and
 * calls the native query verifier at 0xFD2 — but every proof in the repo was previously built by
 * test fixtures. The proof-builder is the only thing that can produce an envelope the precompile
 * will accept: the Merkle root, sibling path and continuity chain all come from Creditcoin's own
 * attestation of the source chain, so they cannot be manufactured locally.
 *
 * REST surface (paths taken from @gluwa/usc-sdk):
 *   GET  /api/v1/attested-height/{chainKey}
 *   GET  /api/v1/proof-by-tx/{chainKey}/{txHash}
 *   POST /api/v1/proof-batch-by-tx/{chainKey}
 *
 * The proof response maps directly onto MeritrAttestor.ingest(...):
 *   txBytes         -> encodedTransaction   (already in the prover's chunk format)
 *   merkleProof     -> merkleRoot + siblings
 *   continuityProof -> lowerEndpointDigest + roots
 */

/**
 * Proof-builder services, as published in the Attestcoin chain/environment documentation.
 * Both were confirmed live: testnet serves chainKey 1 (Sepolia) and 3 (Ethereum mainnet);
 * mainnet serves chainKey 1 (Ethereum mainnet) and rejects 3 with InvalidChainKey.
 */
const DEFAULT_PROVERS = {
  102030: "https://proofbuilder.cc3-mainnet-usc.creditcoin.network",
  102031: "https://proof-gen-api.cc3-testnet.creditcoin.network",
  102032: "https://proof-gen-api.cc3-devnet.creditcoin.network",
};

/** ASC dashboards, useful for eyeballing attestation progress. */
const DASHBOARDS = {
  102030: "https://dashboard.cc3-mainnet-usc.creditcoin.network/",
  102031: "https://dashboard.cc3-testnet.creditcoin.network/",
};

class ProverError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProverError";
    this.status = status;
  }
}

/** Resolve the proof-builder base URL for a Creditcoin chain id. */
function proverUrlFor(creditcoinChainId) {
  const override = process.env.CREDITCOIN_PROOF_BUILDER_URL;
  if (override) return override.replace(/\/+$/, "");
  const known = DEFAULT_PROVERS[Number(creditcoinChainId)];
  if (!known) {
    throw new ProverError(
      `No proof-builder URL known for Creditcoin chain ${creditcoinChainId}. ` +
        "Set CREDITCOIN_PROOF_BUILDER_URL to point at one."
    );
  }
  return known;
}

async function getJson(url, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    const text = await res.text();
    if (!res.ok) {
      throw new ProverError(
        `${res.status} ${res.statusText} from ${url}${text ? ` - ${text.slice(0, 300)}` : ""}`,
        res.status
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProverError(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
    }
  } catch (e) {
    if (e.name === "AbortError") throw new ProverError(`Timed out after ${timeoutMs}ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Highest source-chain block Creditcoin has attested for `chainKey`. */
async function attestedHeight(creditcoinChainId, chainKey) {
  const base = proverUrlFor(creditcoinChainId);
  const body = await getJson(`${base}/api/v1/attested-height/${chainKey}`);
  const h = body?.attestedHeight ?? body?.height;
  if (h === undefined) {
    throw new ProverError(`Unexpected attested-height payload: ${JSON.stringify(body)}`);
  }
  return Number(h);
}

/**
 * Fetch a proof for one source-chain transaction.
 *
 * Returns the raw payload plus `ingestArgs`, shaped exactly as MeritrAttestor.ingest expects.
 * Both the bare payload and a { success, data } envelope are accepted, so a service version
 * bump degrades to a clear error rather than a wrong decode.
 */
async function proofForTx(creditcoinChainId, chainKey, txHash) {
  const base = proverUrlFor(creditcoinChainId);
  const body = await getJson(`${base}/api/v1/proof-by-tx/${chainKey}/${txHash}`);

  const d = body?.data ?? body;
  const merkle = d?.merkleProof ?? d?.merkle_proof;
  const continuity = d?.continuityProof ?? d?.continuity_proof;
  const txBytes = d?.txBytes ?? d?.tx_bytes;

  if (!txBytes || !merkle || !continuity) {
    throw new ProverError(
      "Proof payload missing txBytes/merkleProof/continuityProof. Keys: " +
        Object.keys(d ?? {}).join(", ")
    );
  }

  const siblings = (merkle.siblings ?? []).map((s) => ({
    hash: s.hash ?? s[0],
    isLeft: s.isLeft ?? s.is_left ?? s[1],
  }));

  const height = Number(d.headerNumber ?? d.header_number ?? d.blockHeight);

  return {
    raw: d,
    chainKey: Number(d.chainKey ?? chainKey),
    blockHeight: height,
    txIndex: Number(d.txIndex ?? d.tx_index ?? 0),
    txHash: d.txHash ?? d.tx_hash ?? txHash,
    cached: Boolean(d.cached),
    ingestArgs: {
      chainKey: BigInt(d.chainKey ?? chainKey),
      blockHeight: BigInt(height),
      encodedTransaction: txBytes,
      merkleRoot: merkle.root,
      siblings,
      lowerEndpointDigest: continuity.lowerEndpointDigest ?? continuity.lower_endpoint_digest,
      continuityRoots: continuity.roots ?? [],
    },
  };
}

module.exports = {
  ProverError,
  proverUrlFor,
  attestedHeight,
  proofForTx,
  DEFAULT_PROVERS,
  DASHBOARDS,
};

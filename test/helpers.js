/**
 * Meritr test helpers — synthetic Attestcoin proof construction.
 *
 * The prover hands `ASCBase` a transaction as `abi.encode(uint8 txType, bytes[] chunks)`. These
 * helpers build that exact encoding so the tests drive Meritr through the real decoding path in
 * `EvmV1Decoder` rather than a stub: the same chunk layout, the same receipt slot, the same log
 * tuples that Creditcoin's block prover emits.
 */
const { ethers, network } = require("hardhat");

/** The Attestcoin native query verifier precompile. `0xFD2` == 4050. */
const PRECOMPILE = "0x0000000000000000000000000000000000000FD2";

const coder = ethers.AbiCoder.defaultAbiCoder();

/**
 * Encode an EIP-1559 (type 2) transaction + receipt the way the block prover does.
 * Type 2 uses three chunks: common fields, type-specific fields, receipt.
 *
 * @param {object} opts
 * @param {string} opts.from     tx sender
 * @param {string} opts.to       tx recipient (the protocol contract)
 * @param {Array}  opts.logs     [{ address, topics: string[], data: string }]
 * @param {number} opts.status   receipt status, 1 = success
 */
function encodeProvenTx({ from, to, logs = [], status = 1, nonce = 1n, value = 0n, data = "0x" }) {
  const commonChunk = coder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [nonce, 500000n, from, false, to, value, data]
  );

  // Type 2: (chainId, maxPriorityFeePerGas, maxFeePerGas, accessList, yParity, r, s)
  const typeChunk = coder.encode(
    ["uint64", "uint128", "uint128", "tuple(address,bytes32[])[]", "uint8", "bytes32", "bytes32"],
    [1n, 1_000_000_000n, 30_000_000_000n, [], 0, ethers.ZeroHash, ethers.ZeroHash]
  );

  const receiptChunk = coder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [
      status,
      120000n,
      logs.map((l) => [l.address, l.topics, l.data ?? "0x"]),
      "0x" + "00".repeat(256),
    ]
  );

  return coder.encode(["uint8", "bytes[]"], [2, [commonChunk, typeChunk, receiptChunk]]);
}

/** Left-pad an address into a 32-byte log topic. */
function addressTopic(addr) {
  return ethers.zeroPadValue(ethers.getAddress(addr), 32);
}

/** Pack ordered values into a log's non-indexed data blob. */
function packData(types, values) {
  return coder.encode(types, values);
}

/**
 * Build a Merkle proof whose `calculateTxIndex` differs per `txIndex`, so `ASCBase`'s query-id
 * dedupe treats distinct source transactions as distinct — exactly as it would on-chain.
 */
function merkleProofForIndex(txIndex, depth = 8) {
  const siblings = [];
  for (let i = 0; i < depth; i++) {
    siblings.push({
      hash: ethers.keccak256(ethers.toUtf8Bytes(`sib-${txIndex}-${i}`)),
      isLeft: ((txIndex >> i) & 1) === 0, // isLeft=false contributes bit i in the mock
    });
  }
  return siblings;
}

/**
 * Install the mock verifier at the real precompile address.
 *
 * `hardhat_setCode` gives the address runtime bytecode but leaves its storage empty, so the
 * mock's `shouldVerify` flag starts false and must be switched on explicitly. Returns a
 * contract handle bound to `0xFD2`.
 */
async function installMockPrecompile() {
  const factory = await ethers.getContractFactory("MockNativeQueryVerifier");
  const deployed = await factory.deploy();
  await deployed.waitForDeployment();

  const code = await ethers.provider.getCode(await deployed.getAddress());
  await network.provider.send("hardhat_setCode", [PRECOMPILE, code]);

  const verifier = factory.attach(PRECOMPILE);
  await verifier.setShouldVerify(true);
  return verifier;
}

/** Standard proof envelope arguments accepted by `MeritrAttestor.ingest`. */
function proofArgs(txIndex) {
  return {
    merkleRoot: ethers.keccak256(ethers.toUtf8Bytes(`root-${txIndex}`)),
    siblings: merkleProofForIndex(txIndex),
    lowerEndpointDigest: ethers.keccak256(ethers.toUtf8Bytes("lower")),
    continuityRoots: [ethers.keccak256(ethers.toUtf8Bytes("cont-0"))],
  };
}

async function increaseTime(seconds) {
  await network.provider.send("evm_increaseTime", [Number(seconds)]);
  await network.provider.send("evm_mine");
}

module.exports = {
  PRECOMPILE,
  encodeProvenTx,
  addressTopic,
  packData,
  merkleProofForIndex,
  installMockPrecompile,
  proofArgs,
  increaseTime,
};

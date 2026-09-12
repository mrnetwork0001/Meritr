const { ethers } = require("ethers");
const fs=require("fs"),path=require("path");
const ROOT="/Users/mrnetwork/Meritr";
const book=JSON.parse(fs.readFileSync(path.join(ROOT,"deployments","creditcoinTestnet.json"),"utf8"));
const abi=JSON.parse(fs.readFileSync(path.join(ROOT,"artifacts","contracts","MeritrAttestor.sol","MeritrAttestor.json"),"utf8")).abi;
const {AAVE_V3_EVENTS, AAVE_ETHEREUM, AAVE_SEPOLIA}=require(path.join(ROOT,"scripts","sourceSchemas.js"));
(async()=>{
  const p=new ethers.JsonRpcProvider("https://rpc.cc3-testnet.creditcoin.network");
  const a=new ethers.Contract(book.contracts.MeritrAttestor,abi,p);
  console.log("head", await p.getBlockNumber());
  for (const k of [1,3]) {
    const sc = await a.sourceChains(k);
    console.log(`chainKey ${k}: enabled=${sc.enabled} name=${sc.name} genesis=${sc.genesisTimestamp} bt=${sc.blockTimeSeconds}`);
  }
  console.log("--- schemas on chainKey 3 (Aave ETH pool) ---");
  for (const [n,e] of Object.entries(AAVE_V3_EVENTS)) {
    const s = await a.schemas(3, AAVE_ETHEREUM.pool, e.topic0);
    console.log(`  ${n.padEnd(12)} enabled=${s.enabled} action=${s.action}`);
  }
  console.log("--- schemas on chainKey 1 (Aave Sepolia pool) ---");
  for (const [n,e] of Object.entries(AAVE_V3_EVENTS)) {
    const s = await a.schemas(1, AAVE_SEPOLIA.pool, e.topic0);
    console.log(`  ${n.padEnd(12)} enabled=${s.enabled} action=${s.action}`);
  }
  console.log("verifier:", await a.verifierPrecompile());
})().catch(e=>console.error("ERR",e.message));

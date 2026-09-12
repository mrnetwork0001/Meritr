const { ethers, id } = require("ethers");
const { AAVE_V3_EVENTS } = require("./scripts/sourceSchemas");
const RPCS=["https://1rpc.io/eth","https://eth.drpc.org","https://ethereum-rpc.publicnode.com"];
const SPARK="0xC13e21B648A5Ee794902342038FF3aDAB66BE987";
const COMET_USDC="0xc3d688B66703497DAA19211EEdff47f25384cdc3";
const AAVE="0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const PRIME="0x4e033931ad43597d96D6bcc25c280717730B58B1";
const COMET_SUPPLY = id("Supply(address,address,uint256)");
const COMET_SUPPLY_COLL = id("SupplyCollateral(address,address,address,uint256)");
const COMET_WITHDRAW = id("Withdraw(address,address,uint256)");
const COMET_ABSORB = id("AbsorbDebt(address,address,uint256,uint256)");
console.log("comet topic0s:", {COMET_SUPPLY, COMET_SUPPLY_COLL, COMET_WITHDRAW, COMET_ABSORB});
(async()=>{
 let p, head;
 for (const u of RPCS){ try{ p=new ethers.JsonRpcProvider(u,undefined,{staticNetwork:true}); head=await p.getBlockNumber(); console.log("rpc",u,"head",head); break;}catch(e){console.log("skip",u);} }
 const to=head-60, from=to-49;
 const probes=[
  ["Spark Repay", SPARK, AAVE_V3_EVENTS.REPAY.topic0],
  ["Spark Supply", SPARK, AAVE_V3_EVENTS.SUPPLY.topic0],
  ["Aave Prime Supply", PRIME, AAVE_V3_EVENTS.SUPPLY.topic0],
  ["Aave Core Repay", AAVE, AAVE_V3_EVENTS.REPAY.topic0],
  ["Comet USDC Supply", COMET_USDC, COMET_SUPPLY],
  ["Comet USDC SupplyCollateral", COMET_USDC, COMET_SUPPLY_COLL],
  ["Comet USDC Withdraw", COMET_USDC, COMET_WITHDRAW],
 ];
 for (const [n,addr,t] of probes){
   try{
     const logs=await p.getLogs({address:addr,topics:[t],fromBlock:from,toBlock:to});
     console.log(`${n.padEnd(30)} ${logs.length} log(s) in blocks ${from}-${to}`);
     if(logs.length) console.log(`   sample tx ${logs[0].transactionHash} topics=${logs[0].topics.length} datalen=${(logs[0].data.length-2)/64} words`);
   }catch(e){ console.log(`${n.padEnd(30)} ERR ${String(e.shortMessage||e.message).slice(0,60)}`);}
 }
})().catch(e=>console.error("ERR",e.message));

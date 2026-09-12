const { ethers } = require("ethers");
const { AAVE_V3_EVENTS } = require("./scripts/sourceSchemas");
const RPCS=["https://eth.drpc.org","https://1rpc.io/eth","https://ethereum-rpc.publicnode.com"];
const CANDIDATES = {
  "Aave V3 Core (registered)": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  "Aave V3 Prime/Lido":       "0x4e033931ad43597d96D6bcc25c280717730B58B1",
  "Aave V3 EtherFi":          "0x0AA97c284e98396202b6A04024F5E2c65026F3c0",
  "Spark Protocol pool":      "0xC13e21B648A5Ee794902342038FF3aDAB66BE987",
  "Compound V3 cUSDCv3":      "0xc3d688B66703497DAA19211EEdff47f25384cdc3",
  "Compound V3 cWETHv3":      "0xA17581A9E3356d9A858b789D68B4d866e593aE94",
  "Compound V3 cUSDTv3":      "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840",
  "Morpho Blue":              "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
};
(async()=>{
 let p, head;
 for (const u of RPCS){ try{ p=new ethers.JsonRpcProvider(u,undefined,{staticNetwork:true}); head=await p.getBlockNumber(); console.log("rpc",u,"head",head); break;}catch(e){} }
 for (const [n,addr] of Object.entries(CANDIDATES)) {
   const code = await p.getCode(addr);
   let repays = "n/a";
   try {
     const logs = await p.getLogs({address:addr, topics:[AAVE_V3_EVENTS.REPAY.topic0], fromBlock:head-2000, toBlock:head});
     repays = logs.length;
   } catch(e){ repays="err:"+String(e.shortMessage||e.message).slice(0,40); }
   console.log(`${n.padEnd(28)} code=${code==="0x"?"NONE":code.length+"b"}  aaveRepayLogs(last2000blk)=${repays}`);
 }
})().catch(e=>console.error("ERR",e.message));

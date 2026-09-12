const { ethers } = require("ethers");
const { AAVE_V3_EVENTS } = require("./scripts/sourceSchemas");
const AAVE="0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
(async()=>{
 const p=new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com",undefined,{staticNetwork:true});
 const head=await p.getBlockNumber();
 const to=head-200,from=to-499;
 const logs=await p.getLogs({address:AAVE,topics:[AAVE_V3_EVENTS.REPAY.topic0],fromBlock:from,toBlock:to});
 const hashes=[...new Set(logs.map(l=>l.transactionHash))].slice(0,3);
 console.log(JSON.stringify(hashes));
})().catch(e=>console.error("ERR",e.message));

const { ethers, id } = require("ethers");
const { AAVE_V3_EVENTS } = require("./scripts/sourceSchemas");
const SPARK="0xC13e21B648A5Ee794902342038FF3aDAB66BE987";
const COMET_USDC="0xc3d688B66703497DAA19211EEdff47f25384cdc3";
const PRIME="0x4e033931ad43597d96D6bcc25c280717730B58B1";
const ETHERFI="0x0AA97c284e98396202b6A04024F5E2c65026F3c0";
const C={SUPPLY:id("Supply(address,address,uint256)"),SUPPLY_COLL:id("SupplyCollateral(address,address,address,uint256)"),WITHDRAW:id("Withdraw(address,address,uint256)")};
const RPCS=["https://ethereum-rpc.publicnode.com","https://eth.drpc.org","https://1rpc.io/eth","https://rpc.ankr.com/eth"];
(async()=>{
 for (const u of RPCS){
  let p,head;
  try{ p=new ethers.JsonRpcProvider(u,undefined,{staticNetwork:true}); head=await p.getBlockNumber(); }catch(e){console.log("unreachable",u);continue;}
  for (const span of [1000,500,200,100]){
    const to=head-60,from=to-(span-1);
    try{
      const all=await p.getLogs({address:[SPARK,COMET_USDC,PRIME,ETHERFI],fromBlock:from,toBlock:to});
      console.log(`\n${u} span=${span}: ${all.length} total logs from 4 emitters in ${from}-${to}`);
      const byAddr={};
      for(const l of all){ const k=l.address.toLowerCase(); byAddr[k]=byAddr[k]||{}; byAddr[k][l.topics[0]]=(byAddr[k][l.topics[0]]||0)+1; }
      const names={[SPARK.toLowerCase()]:"Spark",[COMET_USDC.toLowerCase()]:"cUSDCv3",[PRIME.toLowerCase()]:"AavePrime",[ETHERFI.toLowerCase()]:"AaveEtherFi"};
      for(const [a,m] of Object.entries(byAddr)){
        console.log(` ${names[a]||a}:`);
        for(const [t,c] of Object.entries(m)){
          let lbl=t;
          for(const [n,e] of Object.entries(AAVE_V3_EVENTS)) if(e.topic0===t) lbl="AAVE:"+n;
          for(const [n,t2] of Object.entries(C)) if(t2===t) lbl="COMET:"+n;
          console.log(`   ${String(c).padStart(4)}  ${lbl}`);
        }
      }
      return;
    }catch(e){ /* try smaller */ }
  }
 }
 console.log("all rpcs failed");
})().catch(e=>console.error("ERR",e.message));

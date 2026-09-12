const { ethers } = require("ethers");
const fs=require("fs");
const book=JSON.parse(fs.readFileSync("deployments/creditcoinTestnet.json","utf8"));
const abi=JSON.parse(fs.readFileSync("artifacts/contracts/MeritrAttestor.sol/MeritrAttestor.json","utf8")).abi;
(async()=>{
 const p=new ethers.JsonRpcProvider("https://rpc.cc3-testnet.creditcoin.network");
 const a=new ethers.Contract(book.contracts.MeritrAttestor,abi,p);
 const head=await p.getBlockNumber();
 const from=Number(book.deployedAtBlock||0)||head-200000;
 console.log("scanning",from,"->",head);
 let logs=[]; const SPAN=9000;
 for(let f=from; f<=head; f+=SPAN){
   const t=Math.min(f+SPAN-1,head);
   try{ const l=await a.queryFilter(a.filters.CreditFactAttested(),f,t); logs=logs.concat(l);}catch(e){console.log("win fail",f,String(e.shortMessage||e.message).slice(0,60));}
 }
 console.log("CreditFactAttested events:",logs.length);
 const byChain={}, borrowers=new Set(), byAction={};
 for(const l of logs){ const ck=l.args.chainKey.toString(); byChain[ck]=(byChain[ck]||0)+1; borrowers.add(l.args.borrower.toLowerCase()); byAction[l.args.action]=(byAction[l.args.action]||0)+1;}
 console.log("by chainKey:",byChain);
 console.log("by action:",byAction);
 console.log("distinct borrowers:",borrowers.size);
 let multi=0, sum=0;
 const sample=[...borrowers].slice(0,50);
 for(const b of sample){ const f=await a.factsOf(b); sum+=Number(f.chainCount); if(Number(f.chainCount)>1) multi++; }
 console.log(`sampled ${sample.length} borrowers: avg chainCount=${(sum/sample.length).toFixed(2)}  with chainCount>1: ${multi}`);
 const s=await a.scoreOf(sample[0]);
 console.log("sample score breakdown",sample[0],{score:Number(s.score),repay:Number(s.repaymentPts),coll:Number(s.collateralPts),mat:Number(s.maturityPts),div:Number(s.diversityPts),safe:Number(s.safetyPts)});
})().catch(e=>console.error("ERR",e.message));

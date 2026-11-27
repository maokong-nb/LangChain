import {writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {compare} from "../src/experiment.mjs";
import {openWarehouse} from "../src/loopback.mjs";
import {cases,symbols} from "./cases.mjs";
export function score(test,run){
 const g=test.gold,path=run.trace.map(t=>symbols[t.tool]).join("");
 const answer=run.status===g.status&&Object.entries(g.answer).every(([key,value])=>JSON.stringify(run.answer?.[key])===JSON.stringify(value));
 const ledger=run.reserved===g.units&&run.duplicateUnits===0&&run.receipts.every(r=>r.quantity===g.units&&(!g.answer.depot||r.depot===g.answer.depot));
 const good=run.trace.filter(t=>t.code>=200&&t.code<300).length;
 return {id:test.id,group:test.group,fault:test.fault,status:run.status,path,answer,ledger,complete:answer&&ledger,route:path===g.path,first:(path[0]||"")===(g.path[0]||""),good,calls:run.trace.length,duplicate:run.duplicateUnits,reserved:run.reserved,wallMs:run.wallMs,errors:run.trace.filter(t=>t.code>=400).map(t=>t.code)};
}
export async function evaluate(label){
 const warehouse=await openWarehouse(), all={once:[],blind:[],reconcile:[]};
 try{
  for(const c of cases){
   const {runs}=await compare({text:c.text,fault:c.fault,budget:c.budget},{open:warehouse.open});
   for(const run of runs)all[run.policy].push(score(c,run));
  }
 }finally{await warehouse.close();}
 const summary=Object.fromEntries(Object.entries(all).map(([key,rows])=>{
   const times=rows.map(x=>x.wallMs).sort((a,b)=>a-b);
   const sum=k=>rows.reduce((a,r)=>a+Number(r[k]),0);
   return [key,{cases:rows.length,first:sum("first"),route:sum("route"),answer:sum("answer"),ledger:sum("ledger"),complete:sum("complete"),good:sum("good"),calls:sum("calls"),extraUnits:sum("duplicate"),meanMs:+(sum("wallMs")/rows.length).toFixed(2),p95Ms:times[Math.ceil(.95*times.length)-1],failed:rows.filter(r=>!r.complete).map(r=>r.id),httpErrors:rows.flatMap(r=>r.errors).reduce((a,c)=>({...a,[c]:(a[c]||0)+1}),{})}];
 }));
 return {label,executedAt:new Date().toISOString(),environment:{transport:"loopback TCP HTTP",engine:process.version,router:"deterministic",logicalWait:true,modelCalls:0,modelApiCostCny:0},summary,rows:all};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const label=process.argv[3]||"current";const report=await evaluate(label);
 await writeFile(process.argv[2]||new URL("./results.json",import.meta.url),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report.summary,null,2));
}

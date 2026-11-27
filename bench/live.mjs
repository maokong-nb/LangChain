// Opt-in only. Writes per-case traces and provider token usage to the chosen local output file.
import {writeFile} from "node:fs/promises";
import {runAgent} from "../src/agent.mjs";
import {openWarehouse} from "../src/loopback.mjs";
import {liveRouter,metering} from "../src/model.mjs";
import {cases} from "./cases.mjs";
import {score} from "./evaluate.mjs";
const output=process.argv[2]||"live-results.json";
const router=liveRouter(),warehouse=await openWarehouse(),rows=[];
try{
 for(const c of cases){
   const b=warehouse.open(c.fault);
   try{
     const run=await runAgent({text:c.text,fault:c.fault,budget:c.budget},"reconcile",b,{model:router});
     rows.push({...score(c,run),modelRejected:run.modelRejected,modelTurns:run.modelTurns,trace:run.trace});
     await writeFile(output,JSON.stringify({model:process.env.MODEL_NAME,completed:rows.length,complete:rows.filter(r=>r.complete).length,wallClockIncludesBackoff:false,metering:metering(rows.flatMap(r=>r.modelTurns)),rows},null,2));
   }finally{b.close();}
 }
}finally{await warehouse.close();}
console.log("已写入 "+output+"，共 "+rows.length+" 条。");

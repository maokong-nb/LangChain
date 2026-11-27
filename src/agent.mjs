import {RunnableLambda} from "@langchain/core/runnables";
import {z} from "zod";
import {clock, faultLabels, parse, policyLabels} from "./catalog.mjs";
import {toolsFor} from "./tools.mjs";

export const options=z.strictObject({
 text:z.string().min(1).max(260), fault:z.enum(Object.keys(faultLabels)).default("after"),
 budget:z.number().int().min(0).max(3).default(2)
});
export const resultNames={held:"已预留",stock:"已返回库存",eta:"已返回到货方案",clarify:"需要澄清",
 shortage:"库存不足",late:"赶不上截止时间",denied:"无预留权限",uncertain:"待人工核验",unavailable:"服务不可用",
 model_error:"模型未完成工具选择",bounded:"达到执行上限"};
const operation="WO-0187"; // Each isolated experiment has one business request, shared across all its attempts.

function terminal(status,why,answer=null){return {status,why,answer};}
function call(name,args,why){return {name,args,why};}
function plan(s,t){
 if(t.issues.length)return terminal("clarify",t.issues.join(" "));
 if(!s.stock)return call("get_stock",{sku:t.sku},"先确认两个仓的可用量");
 if(t.intent==="stock")return terminal("stock","已获得仓库库存快照",s.stock);
 const candidates=Object.keys(s.stock.stock).filter(k=>s.stock.stock[k]>=t.quantity);
 if(!candidates.length)return terminal("shortage","没有单个仓库能满足本次数量");
 if(!s.quote)return call("quote_eta",{sku:t.sku,destination:t.destination},"核对能足量交货的仓与到货期限");
 const sorted=candidates.sort((a,b)=>s.quote.arrivals[a]-s.quote.arrivals[b]||a.localeCompare(b));
 const depot=sorted[0],arrival=s.quote.arrivals[depot];
 if(arrival>t.deadline)return terminal("late","最早 "+clock(arrival)+"，晚于约定 "+clock(t.deadline),{depot,arrival});
 if(t.intent==="eta")return terminal("eta","选出能满足数量与时限的最快仓",{depot,arrival});
 return call("reserve_parts",{sku:t.sku,depot,quantity:t.quantity},"用户已要求预留，按交付条件提交");
}
function transient(code){return [429,502,503,504].includes(code);}
function after(s,tool,observed,config){
 const {code,body,retryAfter}=observed,{policy,budget}=config;
 const retry=(name,args,why,delay)=>{
   if(s.retries>=budget)return terminal(name==="get_receipt"||tool.name==="reserve_parts"?"uncertain":"unavailable","重试预算已用完，保留最后观测");
   s.retries++;s.time+=delay;
   return {...call(name,args,why),delay};
 };
 if(code>=200&&code<300){
   if(tool.name==="get_stock")s.stock=body;
   if(tool.name==="quote_eta")s.quote=body;
   if(tool.name==="reserve_parts")return terminal("held","已收到预留回执 "+body.receipt.id,body.receipt);
   if(tool.name==="get_receipt"){
     if(body.receipts.length===1)return terminal("held","按业务号查到 "+body.receipts[0].id+"，已确认写入",body.receipts[0]);
     if(body.receipts.length>1)return terminal("uncertain","发现多笔预留，需要人工核验");
     return retry("reserve_parts",s.lastWrite,"仓库确认尚无回执，用原幂等键重发",1);
   }
   return null;
 }
 if(code===403)return terminal("denied","仓库拒绝了权限，本次没有重试");
 if(code===409&&body.error==="out_of_stock"){
   if(policy==="reconcile"&&s.retries<budget){
     s.stock=null;s.quote=null;s.retries++;
     return call("get_stock",{sku:s.ticket.sku},"读写之间库存变化，重新选仓并核对时限");
   }
   return terminal("shortage","仓库在预留时已无足量库存");
 }
 if(!transient(code))return terminal("unavailable","仓库返回不可重试的响应 "+code);
 if(tool.name==="reserve_parts"){
   if(policy==="once")return terminal("uncertain","504 无法确定写入结果，转人工核验");
   if(policy==="reconcile")return call("get_receipt",{},"写入结果不明，先按原业务号核验");
   return retry("reserve_parts",tool.args,"对照策略直接发起另一笔预留",1);
 }
 if(policy==="once")return terminal(tool.name==="get_receipt"?"uncertain":"unavailable","单次策略在错误处停止");
 const delay=policy==="blind"?1:Math.max(retryAfter||0,2**s.retries);
 return retry(tool.name,tool.args,code===429?"按限流等待后再读库存":"读取暂不可用，按预算重试",delay);
}
function authorized(chosen,expected,ticket){
 if(!chosen||chosen.name!==expected.name||!chosen.args||typeof chosen.args!=="object")return false;
 const keys=Object.keys(expected.args);
 if(keys.length!==Object.keys(chosen.args).length||!keys.every(k=>chosen.args[k]===expected.args[k]))return false;
 return chosen.name!=="reserve_parts"||ticket.intent==="reserve";
}
export async function runAgent(raw,policy,backend,{model=null,realWait=false}={}){
 const config=options.parse(raw);
 if(!Object.hasOwn(policyLabels,policy))throw Error("未知执行策略");
 const ticket=parse(config.text), {world,send}=backend;
 const s={ticket,stock:null,quote:null,retries:0,time:0,lastWrite:null,writes:0};
 const trace=[],modelTurns=[];let next=null,done=null,modelRejected=0;
 const tools=toolsFor(async(name,args)=>{
   const payload={...args};
   if(name==="reserve_parts"){
     s.writes++;s.lastWrite={...args};
     payload.operation=operation;payload.key=operation+(policy==="blind"?"-attempt-"+s.writes:"-stable");
   }
   if(name==="get_receipt")payload.operation=operation;
   world.time=s.time;
   const response=await send(name,payload),body=await response.json();
   return {code:response.status,body,retryAfter:Number(response.headers.get("Retry-After")||0),payload};
 });
 const planner=RunnableLambda.from(()=>next||plan(s,ticket));
 const start=performance.now();
 for(let turn=0;turn<16;turn++){
   const expected=await planner.invoke({});if(expected.status){done=expected;break;}
   let chosen=expected;
   if(model){
     const m=await model({ticket,trace,tools:Object.values(tools),priorErrors:modelTurns.filter(x=>x.error).slice(-1),remaining:config.budget-s.retries});
     modelTurns.push({tool:m.name??null,usage:m.usage??null,elapsedMs:m.elapsedMs??null});
     if(!authorized(m,expected,ticket)){
       modelRejected++;modelTurns.at(-1).error="工具或参数不符合当前证据与授权";
       if(modelRejected>=2){done=terminal("model_error","模型未选出与当前任务相符的工具");break;}
       continue;
     }
     chosen=m;
   }
   if(realWait&&expected.delay)await new Promise(r=>setTimeout(r,expected.delay*1000));
   const obs=JSON.parse(await tools[chosen.name].invoke(chosen.args));
   trace.push({step:trace.length+1,tool:chosen.name,why:expected.why,atTick:s.time,waitSeconds:expected.delay||0,
     args:obs.payload,code:obs.code,retryAfter:obs.retryAfter,output:obs.body});
   next=after(s,{name:chosen.name,args:chosen.args},obs,{...config,policy});
   if(next?.status){done=next;break;}
 }
 done??=terminal("bounded","已达到工具运行上限");
 const receipts=world.ledger.map(row=>({...row})),reserved=receipts.reduce((sum,r)=>sum+r.quantity,0);
 return {policy,mode:model?"live-model":"rules",intent:ticket.intent,sku:ticket.sku,requested:ticket.quantity,destination:ticket.destination,
   ...done,trace,modelTurns,modelRejected,retries:s.retries,logicalWaitSeconds:s.time,receipts,reserved,
   remaining:ticket.sku?{...world.stock[ticket.sku]}:null,duplicateUnits:Math.max(0,reserved-(ticket.quantity||0)),
   wallMs:Math.round((performance.now()-start)*1000)/1000};
}

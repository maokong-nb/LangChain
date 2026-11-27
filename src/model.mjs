import {ChatOpenAI} from "@langchain/openai";
import {HumanMessage,SystemMessage} from "@langchain/core/messages";

const guide="你是双仓备件调拨员。每轮用 tool calling 选一个动作。先查库存，再报价，选能足量按时交付且到货最早的仓。在读请求或缺少明确授权时不可写。若预留超时，先按原业务号查回执。空回执才重发。库存冲突重新读库存。读取临时错误按预算重试。每次传 schema 精确要求的参数。时刻以当天零点后的分钟表示。";
export function liveRouter(env=process.env){
 if(!env.MODEL_NAME||!env.MODEL_API_KEY)throw Error("请在本机设置 MODEL_NAME 与 MODEL_API_KEY。");
 const chat=new ChatOpenAI({model:env.MODEL_NAME,apiKey:env.MODEL_API_KEY,maxRetries:0,timeout:20000,
   ...(env.MODEL_BASE_URL?{configuration:{baseURL:env.MODEL_BASE_URL}}:{})});
 return async({ticket,trace,tools,priorErrors,remaining})=>{
   const start=performance.now();
   try{
     const assistant=chat.bindTools(tools);
     const answer=await assistant.invoke([new SystemMessage(guide),new HumanMessage(JSON.stringify({request:ticket.text,parsed:ticket,seen:trace.map(x=>({tool:x.tool,args:x.args,code:x.code,response:x.output})),rejected:priorErrors,budget:remaining}))]);
     const choices=answer.tool_calls||[];
     return {...(choices.length===1?choices[0]:{}),usage:answer.usage_metadata??null,elapsedMs:Math.round(performance.now()-start)};
   }catch{return {error:"模型服务调用失败",elapsedMs:Math.round(performance.now()-start)};}
 };
}
export function metering(turns,env=process.env){
 if(!turns.length)return {calls:0,inputTokens:0,outputTokens:0,estimatedCny:0};
 const valid=turns.every(t=>Number.isFinite(t.usage?.input_tokens)&&Number.isFinite(t.usage?.output_tokens));
 const rate=k=>env[k]!=null&&String(env[k]).trim()!==""&&Number.isFinite(Number(env[k]))&&Number(env[k])>=0?Number(env[k]):null;
 const pi=rate("MODEL_INPUT_CNY_PER_M"),po=rate("MODEL_OUTPUT_CNY_PER_M");
 const inputTokens=valid?turns.reduce((a,t)=>a+t.usage.input_tokens,0):null;
 const outputTokens=valid?turns.reduce((a,t)=>a+t.usage.output_tokens,0):null;
 return {calls:turns.length,inputTokens,outputTokens,estimatedCny:valid&&pi!==null&&po!==null?(inputTokens*pi+outputTokens*po)/1e6:null};
}

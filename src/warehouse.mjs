import {parts,minutes} from "./catalog.mjs";
export function makeWorld(fault="clean"){
 return {fault, time:0, requests:{}, retryAt:null, stock:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,{...v.stock}])), ledger:[]};
}
function reply(code,body,headers={}){return Response.json(body,{status:code,headers});}
export async function warehouse(req,world){
 const url=new URL(req.url), path=url.pathname.split("/").pop();
 if(req.method!=="POST"||!["get_stock","quote_eta","reserve_parts","get_receipt"].includes(path))return reply(404,{error:"unknown_endpoint"});
 const data=await req.json(),n=(world.requests[path]??0)+1;world.requests[path]=n;
 if(path==="get_receipt"){
   if(world.fault==="dark")return reply(503,{error:"receipt_store_unavailable"});
   return reply(200,{operation:data.operation, receipts:world.ledger.filter(x=>x.operation===data.operation)});
 }
 if(!Object.hasOwn(parts,data.sku))return reply(404,{error:"unknown_sku"});
 if(path==="get_stock"){
   if(world.fault==="outage")return reply(503,{error:"warehouse_offline"});
   if(world.fault==="rate"){
     if(world.retryAt===null)world.retryAt=world.time+2;
     if(world.time<world.retryAt)return reply(429,{error:"rate_limited"},{"Retry-After":String(world.retryAt-world.time)});
   }
   return reply(200,{sku:data.sku,stock:{...world.stock[data.sku]}});
 }
 if(path==="quote_eta"){
   if(!["SZ","GZ","DG"].includes(data.destination))return reply(422,{error:"unknown_destination"});
   return reply(200,{destination:data.destination,arrivals:Object.fromEntries(Object.entries(minutes).map(([depot,t])=>[depot,840+t[data.destination]]))});
 }
 if(world.fault==="denied")return reply(403,{error:"reservation_denied"});
 if(!["SZ","GZ"].includes(data.depot)||!Number.isInteger(data.quantity)||data.quantity<1||data.quantity>20 ||
   typeof data.operation!=="string" || typeof data.key!=="string")return reply(422,{error:"invalid_reservation"});
 const found=world.ledger.find(x=>x.key===data.key);
 if(found){
   if(["operation","sku","depot","quantity"].some(k=>found[k]!==data[k]))return reply(409,{error:"key_payload_conflict"});
   return reply(200,{receipt:found,replayed:true});
 }
 if(world.fault==="before"&&n===1)return reply(504,{error:"ack_timeout"});
 if(world.fault==="race"&&n===1)world.stock[data.sku][data.depot]=0;
 if(world.stock[data.sku][data.depot]<data.quantity)return reply(409,{error:"out_of_stock"});
 const receipt={id:"WH-"+String(world.ledger.length+1).padStart(3,"0"),operation:data.operation,key:data.key,sku:data.sku,depot:data.depot,quantity:data.quantity};
 // No await separates the idempotency check, stock mutation and receipt in this single experiment.
 world.stock[data.sku][data.depot]-=data.quantity;world.ledger.push(receipt);
 if(["after","dark"].includes(world.fault)&&n===1)return reply(504,{error:"ack_timeout"});
 return reply(201,{receipt,replayed:false});
}
export function internalAdapter(world){return (name,args)=>warehouse(new Request("https://warehouse.invalid/"+name,{method:"POST",body:JSON.stringify(args),headers:{"Content-Type":"application/json"}}),world);}

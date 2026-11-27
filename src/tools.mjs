import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {locations,parts} from "./catalog.mjs";

const sku=z.enum(Object.keys(parts)), depot=z.enum(["SZ","GZ"]), dest=z.enum(Object.keys(locations));
const specs={
 get_stock:["查指定 SKU 在两个仓库可用的数量。",{sku}],
 quote_eta:["读取两个仓库送往指定城市的到货时刻。",{sku,destination:dest}],
 reserve_parts:["只在已明确要求预留时，按选定仓、数量提交预留。",{sku,depot,quantity:z.number().int().min(1).max(20)}],
 get_receipt:["按服务端锁定的本次业务编号确认仓库是否已成功预留。",{}]
};
export function toolsFor(execute){
 return Object.fromEntries(Object.entries(specs).map(([name,[description,fields]])=>[name,tool(
   async args=>JSON.stringify(await execute(name,args)),
   {name,description,schema:z.strictObject(fields)}
 )]));
}

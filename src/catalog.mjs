// All names, stock and dispatch times are synthetic. The dispatch board runs at 14:00.
export const parts = {
  "PWR-24": {label:"24V 电源板", aliases:["电源板","电源模块"], stock:{SZ:8,GZ:12}},
  "FAN-08": {label:"散热风扇", aliases:["风扇","风机"], stock:{SZ:2,GZ:9}},
  "SEN-02": {label:"温度传感器", aliases:["传感器","温度探头"], stock:{SZ:0,GZ:5}}
};
export const locations={SZ:"深圳",GZ:"广州",DG:"东莞"};
export const minutes={SZ:{SZ:35,DG:80,GZ:130},GZ:{SZ:100,DG:65,GZ:30}};
export const faultLabels={
  after:"写入后回执超时",before:"写入前超时",rate:"库存接口限流一次",denied:"预留权限被拒",
  dark:"写入后回执无法核验",race:"首选仓库存被其他工单占用",outage:"库存服务持续不可用",clean:"服务正常"
};
export const policyLabels={once:"一次调用",blind:"直接重发",reconcile:"先查回执"};
export const toolLabels={get_stock:"查库存",quote_eta:"查到货时间",reserve_parts:"预留备件",get_receipt:"查回执"};
export function clock(n){return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
export function parse(text){
  if(typeof text!=="string"||!text.trim()||text.length>260)throw Error("请输入 1 至 260 字的现场需求。");
  const intent=/不要预留|不(?:用|要)锁|只查|只看|库存有多少|查库存/.test(text)
    ? (/到货|送达|能到|几点|何时/.test(text)?"eta":"stock")
    : /预留|调拨|锁定|锁库存|留货/.test(text)?"reserve":/到货|送达|能到|几点|何时/.test(text)?"eta":/库存|有货/.test(text)?"stock":null;
  const skus=Object.entries(parts).filter(([id,p])=>text.toUpperCase().includes(id)||p.aliases.some(s=>text.includes(s))).map(([id])=>id);
  const cities=Object.entries(locations).filter(([,v])=>text.includes(v)).map(([id])=>id);
  const counts=[...text.matchAll(/([0-9]+)\s*(?:块|个|件|台|只|片|套)/g)].map(a=>Number(a[1]));
  const times=[...text.matchAll(/(?:^|[^\d])(\d{1,2})[:：](\d{2})(?!\d)/g)].map(a=>[Number(a[1]),Number(a[2])]);
  const issues=[];
  if(!intent)issues.push("请说明需要查库存、查询到货时间还是预留。");
  if(skus.length!==1)issues.push("请指定一种演示备件。");
  if(intent!=="stock"&&cities.length!==1)issues.push("请指定唯一目的地。");
  if(intent!=="stock"&&(counts.length!==1||counts[0]<1||counts[0]>20))issues.push("请给出 1 至 20 件的数量。");
  if(times.length>1 || times.some(([h,m])=>h>23||m>59))issues.push("请给出有效的单一截止时刻。");
  return {text,intent,sku:skus[0]??null,destination:cities[0]??null,quantity:counts[0]??null,
    deadline:times.length?times[0][0]*60+times[0][1]:1439,issues};
}
export const example="为深圳现场预留 2 块电源板，要求 16:00 前到货";

// Written against the synthetic inventory/dispatch contract. The runner never receives these labels.
// S stock, E delivery quote, W reserve, R read receipt. Quantities are warehouse ledger effects.
const central="为深圳现场预留 2 块电源板，要求 16:00 前到货";
const rows=[
 ["01","库存","查电源板库存","clean","stock","S",0,{stock:{SZ:8,GZ:12}}],
 ["02","库存","只看风扇库存","after","stock","S",0,{stock:{SZ:2,GZ:9}}],
 ["03","库存","温度探头有货吗","clean","stock","S",0,{stock:{SZ:0,GZ:5}}],
 ["04","到货","2 块电源板送达深圳需要多久","after","eta","SE",0,{depot:"SZ",arrival:875}],
 ["05","到货","广州 3 个风扇何时能到","before","eta","SE",0,{depot:"GZ",arrival:870}],
 ["06","到货","东莞 2 个传感器几点到货","clean","eta","SE",0,{depot:"GZ",arrival:905}],
 ["07","正常预留",central,"clean","held","SEW",2,{depot:"SZ"}],
 ["08","跨仓","为深圳预留 3 个风扇，16:00 前到货","clean","held","SEW",3,{depot:"GZ"}],
 ["09","边界时间","为东莞预留 1 个传感器，15:05 前到货","clean","held","SEW",1,{depot:"GZ"}],
 ["10","缺货","为广州预留 14 块电源板","after","shortage","S",0],
 ["11","超时限","为深圳预留 3 个风扇，15:39 前送达","clean","late","SE",0,{depot:"GZ",arrival:940}],
 ["12","写后超时",central,"after","held","SEWR",2,{depot:"SZ"}],
 ["13","写前超时",central,"before","held","SEWRW",2,{depot:"SZ"}],
 ["14","限流",central,"rate","held","SSEW",2,{depot:"SZ"}],
 ["15","权限",central,"denied","denied","SEW",0],
 ["16","回执离线",central,"dark","uncertain","SEWRRR",2],
 ["17","库存竞争",central,"race","held","SEWSEW",2,{depot:"GZ"}],
 ["18","库存竞争且超期","为深圳预留 2 块电源板，15:00 前送达","race","late","SEWSE",0,{depot:"GZ",arrival:940}],
 ["19","持续故障",central,"outage","unavailable","SSS",0],
 ["20","零预算",central,"before","not_held","SEWR",0,{},0],
 ["21","零预算",central,"after","held","SEWR",2,{depot:"SZ"},0],
 ["22","零预算",central,"rate","unavailable","S",0,{},0],
 ["23","缺少数量","为深圳预留电源板","clean","clarify","",0],
 ["24","缺少城市","预留 2 块电源板","clean","clarify","",0],
 ["25","型号含糊","为深圳预留 2 件电源板或风扇","after","clarify","",0],
 ["26","数量越界","为广州预留 0 个风扇","clean","clarify","",0],
 ["27","写入否定","深圳 2 块电源板多久能到？先别预留","clean","eta","SE",0,{depot:"SZ",arrival:875}],
 ["28","口语数量","给深圳留两块电源板，16:00 前送达","clean","held","SEW",2,{depot:"SZ"}],
 ["29","中文时间","为深圳预留 3 个风扇，要求 15点前送达","clean","late","SE",0,{depot:"GZ",arrival:940}],
 ["30","数量与时间","给广州留十二块电源板，下午三点前到货","before","held","SEWRW",12,{depot:"GZ"}],
 ["31","只查时效","深圳 3 个风扇，下午三点半之前能到吗？不要锁库存","denied","late","SE",0,{depot:"GZ",arrival:940}],
 ["32","目的地含糊","为深圳或广州预留 2 个风扇","clean","clarify","",0],
 ["33","无动作授权","深圳 2 块电源板，先别预留","clean","clarify","",0],
 ["34","批量不足","为深圳预留二十个传感器","after","shortage","S",0],
 ["35","不合法时刻","为深圳预留 2 个风扇，25:60 前送达","clean","clarify","",0],
 ["36","限流只读","查风扇库存","rate","stock","SS",0,{stock:{SZ:2,GZ:9}},1]
];
export const cases=rows.map(([id,group,text,fault,status,path,units, answer={},budget=2])=>({id:"D"+id,group,text,fault,budget,gold:{status,path,units,answer}}));
export const symbols={get_stock:"S",quote_eta:"E",reserve_parts:"W",get_receipt:"R"};

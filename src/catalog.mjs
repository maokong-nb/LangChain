// All names, stock and dispatch times are synthetic. The dispatch board runs at 14:00.
export const parts = {
  "PWR-24": {
    label: "24V 电源板",
    aliases: ["电源板", "电源模块"],
    stock: { SZ: 8, GZ: 12 },
  },
  "FAN-08": {
    label: "散热风扇",
    aliases: ["风扇", "风机"],
    stock: { SZ: 2, GZ: 9 },
  },
  "SEN-02": {
    label: "温度传感器",
    aliases: ["传感器", "温度探头"],
    stock: { SZ: 0, GZ: 5 },
  },
};
export const locations = { SZ: "深圳", GZ: "广州", DG: "东莞" };
export const minutes = {
  SZ: { SZ: 35, DG: 80, GZ: 130 },
  GZ: { SZ: 100, DG: 65, GZ: 30 },
};
export const faultLabels = {
  after: "写入后回执超时",
  before: "写入前超时",
  rate: "库存接口限流一次",
  denied: "预留权限被拒",
  dark: "写入后回执无法核验",
  race: "首选仓库存被其他工单占用",
  outage: "库存服务持续不可用",
  clean: "服务正常",
};
export const policyLabels = {
  once: "一次调用",
  blind: "直接重发",
  reconcile: "先查回执",
};
export const toolLabels = {
  get_stock: "查库存",
  quote_eta: "查到货时间",
  reserve_parts: "预留备件",
  get_receipt: "查回执",
};
export function clock(n) {
  return (
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
const cnDigits = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
function numberOf(token) {
  if (/^\d+$/.test(token)) return Number(token);
  if (Object.hasOwn(cnDigits, token)) return cnDigits[token];
  const pieces = token.split("十");
  if (pieces.length !== 2) return NaN;
  const tens = pieces[0] ? cnDigits[pieces[0]] : 1,
    ones = pieces[1] ? cnDigits[pieces[1]] : 0;
  return tens * 10 + ones;
}
export function parse(text) {
  if (typeof text !== "string" || !text.trim() || text.length > 260)
    throw Error("请输入 1 至 260 字的现场需求。");
  const readOnly =
    /(?:别|禁止|不要|不用|暂不|不可|无需)\s*(?:再|先)?\s*(?:预留|锁(?:定|库存|货)?|调拨|留货|下单)|只(?:查|看|问)/.test(
      text,
    );
  const arrival = /到货|送达|能到|几点|何时|多久|时效/.test(text);
  const stockQuery =
    /查(?:看)?[^，。？]{0,12}库存|只看[^，。？]{0,12}库存|有货|库存[^，。？]{0,4}(?:多少|查询)|库存$/.test(
      text,
    );
  const write =
    /预留|调拨|锁定|锁库存|留货|留\s*(?:[0-9一二两三四五六七八九十])/.test(
      text,
    );
  const intent =
    !readOnly && write
      ? "reserve"
      : arrival
        ? "eta"
        : stockQuery
          ? "stock"
          : null;
  const skus = Object.entries(parts)
    .filter(
      ([id, p]) =>
        text.toUpperCase().includes(id) ||
        p.aliases.some((s) => text.includes(s)),
    )
    .map(([id]) => id);
  const cities = Object.entries(locations)
    .filter(([, v]) => text.includes(v))
    .map(([id]) => id);
  const counts = [
    ...text.matchAll(
      /([+-]?[0-9.]+|[零一二两三四五六七八九十]+)\s*(?:块|个|件|台|只|片|套)/g,
    ),
  ].map((a) => numberOf(a[1]));
  const times = [
    ...text.matchAll(
      /(凌晨|早上|上午|中午|下午|晚上)?\s*([0-9]{1,3}|[零一二两三四五六七八九十]+)(?:[:：](\d{1,3})|[点时](半|[0-9]{1,3}|[零一二两三四五六七八九十]+)?分?)/g,
    ),
  ].map(([, period, h, m1, m2]) => {
    let hour = numberOf(h);
    if (period && (hour < 1 || hour > 12)) return [NaN, NaN];
    if (
      (period === "下午" || period === "晚上" || period === "中午") &&
      hour < 12
    )
      hour += 12;
    if (
      (period === "凌晨" || period === "上午" || period === "早上") &&
      hour === 12
    )
      hour = 0;
    return [hour, m2 === "半" ? 30 : numberOf(m1 || m2 || "0")];
  });
  const issues = [];
  if (!intent) issues.push("请说明需要查库存、查询到货时间还是预留。");
  if (skus.length !== 1) issues.push("请指定一种演示备件。");
  if (intent !== "stock" && cities.length !== 1)
    issues.push("请指定唯一目的地。");
  if (
    intent !== "stock" &&
    (counts.length !== 1 ||
      !Number.isInteger(counts[0]) ||
      counts[0] < 1 ||
      counts[0] > 20)
  )
    issues.push("请给出 1 至 20 件的数量。");
  if (
    times.length > 1 ||
    times.some(
      ([h, m]) =>
        !Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59,
    )
  )
    issues.push("请给出有效的单一截止时刻。");
  if (/明天|后天|下周|昨天|大约|大概|稍后再|如果|除非/.test(text))
    issues.push("请确认今天单笔需求的数量、授权和时刻。");
  return {
    text,
    intent,
    sku: skus[0] ?? null,
    destination: cities[0] ?? null,
    quantity: counts[0] ?? null,
    deadline: times.length ? times[0][0] * 60 + times[0][1] : 1439,
    issues,
  };
}
export const example = "为深圳现场预留 2 块电源板，要求 16:00 前到货";

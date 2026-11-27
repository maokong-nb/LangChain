"use strict";
const $ = (id) => document.getElementById(id);
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
const state = {
  config: null,
  run: null,
  policy: "reconcile",
  step: 0,
  eval: null,
  blind: null,
};
let loading = false;
const names = { SZ: "深圳仓", GZ: "广州仓", DG: "东莞" },
  modes = { once: "一次调用", blind: "直接重发", reconcile: "先查回执" };
async function request(url, body) {
  const res = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}
function show(name) {
  if (!["lab", "blind", "bench"].includes(name)) name = "lab";
  for (const n of document.querySelectorAll(".view")) n.hidden = n.id !== name;
  for (const b of document.querySelectorAll("[data-tab]"))
    b.setAttribute("aria-pressed", String(b.dataset.tab === name));
  if (name === "bench")
    loadBench().catch((e) => ($("benchSummary").textContent = e.message));
  if (name === "blind" && !state.blind) resetBlind();
}
for (const b of document.querySelectorAll("[data-tab]"))
  b.onclick = () => {
    location.hash = b.dataset.tab;
    show(b.dataset.tab);
  };
addEventListener("hashchange", () => show(location.hash.slice(1)));
function file(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const presets = {
  预留两块: "为深圳现场预留 2 块电源板，要求 16:00 前到货",
  先别预留: "深圳 2 块电源板多久能到？先别预留",
  赶不上时限: "为深圳预留 3 个风扇，下午三点前送达",
};
for (const [n, t] of Object.entries(presets)) {
  const b = el("button", n);
  b.type = "button";
  b.onclick = () => {
    $("ticket").value = t;
    $("notice").textContent = "点击运行以查看新工单。";
  };
  $("examples").append(b);
}
function pickPolicy(value) {
  state.policy = value;
  const r = state.run.runs.find((x) => x.policy === value);
  const i = r.trace.findIndex((x) => x.code >= 400);
  state.step = i >= 0 ? i : Math.max(0, r.trace.length - 1);
  draw();
}
function draw() {
  const { runs, input } = state.run,
    c = state.config;
  $("case-context").textContent =
    c.faultLabels[input.fault] +
    " · 预算 " +
    input.budget +
    " 次 · " +
    input.text;
  const cards = $("cards");
  cards.replaceChildren();
  for (const r of runs) {
    const b = el("button", undefined, "result-card");
    b.type = "button";
    b.setAttribute("aria-pressed", String(r.policy === state.policy));
    b.onclick = () => pickPolicy(r.policy);
    const title = el("div");
    title.append(
      el("strong", modes[r.policy]),
      el("small", c.resultNames[r.status]),
    );
    const bins = el("div", undefined, "bins");
    bins.setAttribute("aria-hidden", "true");
    const count = Math.min(20, Math.max(4, r.reserved));
    for (let k = 0; k < count; k++)
      bins.append(
        el(
          "i",
          undefined,
          "bin " +
            (k >= r.reserved
              ? "empty"
              : k >= (r.requested ?? 0)
                ? "extra"
                : ""),
        ),
      );
    const num = el("div", String(r.reserved), "numbers");
    num.append(el("span", " 件"));
    b.append(title, bins, num);
    cards.append(b);
  }
  const r = runs.find((x) => x.policy === state.policy);
  $("traceheading").textContent = modes[r.policy] + " · 工具调用轨迹";
  $("tracestat").textContent =
    r.trace.length + " 次工具调用 / " + r.logicalWaitSeconds + " 秒逻辑等待";
  let answer = r.why;
  if (r.answer?.depot) answer += " · " + names[r.answer.depot];
  if (r.answer?.arrival != null)
    answer +=
      " · " +
      String(Math.floor(r.answer.arrival / 60)).padStart(2, "0") +
      ":" +
      String(r.answer.arrival % 60).padStart(2, "0");
  if (r.answer?.stock)
    answer +=
      " · 深圳 " + r.answer.stock.SZ + " 件，广州 " + r.answer.stock.GZ + " 件";
  $("answer").textContent =
    answer +
    "。仓库记录 " +
    r.receipts.length +
    " 笔，本单多占 " +
    r.duplicateUnits +
    " 件。";
  $("steps").replaceChildren();
  for (const [i, t] of r.trace.entries()) {
    const b = el("button", undefined, "step");
    b.type = "button";
    b.setAttribute("aria-pressed", String(state.step === i));
    b.onclick = () => {
      state.step = i;
      draw();
    };
    b.append(
      el("span", String(t.step).padStart(2, "0")),
      el("span", c.toolLabels[t.tool]),
      el("b", "HTTP " + t.code, t.code >= 400 ? "error" : ""),
    );
    $("steps").append(b);
  }
  const t = r.trace[state.step],
    inspect = $("inspect");
  inspect.replaceChildren();
  if (!t) {
    inspect.append(el("p", "本次在澄清环节停止，工具调用数为零。"));
    return;
  }
  inspect.append(
    el("strong", t.tool + " / HTTP " + t.code),
    el("p", t.why + (t.waitSeconds ? " · 等待 " + t.waitSeconds + " 秒" : "")),
    el(
      "pre",
      JSON.stringify(
        {
          request: t.args,
          response: t.output,
          ...(t.retryAfter ? { retryAfter: t.retryAfter } : {}),
        },
        null,
        2,
      ),
    ),
  );
}
async function run() {
  if (loading || !state.config) return;
  loading = true;
  $("run").disabled = true;
  $("notice").textContent = "正在运行 3 个隔离的仓库案例…";
  try {
    state.run = await request("/api/compare", {
      text: $("ticket").value,
      fault: $("fault").value,
      budget: Number($("budget").value),
    });
    pickPolicy("reconcile");
    $("download").disabled = false;
    $("notice").textContent = "已完成三种策略。";
  } catch (e) {
    $("notice").textContent = e.message;
  } finally {
    loading = false;
    $("run").disabled = false;
  }
}
$("download").disabled = true;
$("download").onclick = () => {
  if (state.run) file("dispatch-run.json", state.run);
};
$("dispatch").onsubmit = (e) => {
  e.preventDefault();
  run();
};
function resetBlind() {
  const n = crypto.getRandomValues(new Uint8Array(1))[0];
  state.blind = { fault: n % 2 === 0 ? "before" : "after", locked: false };
  $("blind-result").replaceChildren(
    el("p", "工单的隐藏状态已经选定。请选择一次处理方式，再核对账本。"),
  );
  for (const b of document.querySelectorAll("[data-pick]")) b.disabled = false;
  $("again").hidden = true;
}
for (const b of document.querySelectorAll("[data-pick]"))
  b.onclick = async () => {
    if (!state.config || state.blind.locked) return;
    state.blind.locked = true;
    for (const x of document.querySelectorAll("[data-pick]")) x.disabled = true;
    try {
      const input = {
          text: state.config.example,
          fault: state.blind.fault,
          budget: 2,
        },
        data = await request("/api/compare", input),
        r = data.runs.find((x) => x.policy === b.dataset.pick);
      const box = $("blind-result");
      box.replaceChildren(
        el("p", "隐藏事件 · " + state.config.faultLabels[input.fault]),
        el("div", r.reserved + " 件", "big"),
        el(
          "p",
          "你的选择为“" +
            modes[r.policy] +
            "”。" +
            r.why +
            "。账本留下 " +
            r.receipts.length +
            " 笔记录，多占 " +
            r.duplicateUnits +
            " 件。",
        ),
        el(
          "pre",
          r.trace
            .map((t) => t.step + "  " + t.tool + "   " + t.code)
            .join("\n"),
          "terminal",
        ),
      );
      const inspect = el("button", "对比同一事件下的三种策略", "linkbutton");
      inspect.onclick = () => {
        $("ticket").value = input.text;
        $("fault").value = input.fault;
        $("budget").value = "2";
        state.run = data;
        pickPolicy(r.policy);
        $("download").disabled = false;
        location.hash = "lab";
        show("lab");
      };
      box.append(inspect);
    } catch (e) {
      $("blind-result").textContent = e.message;
    }
    $("again").hidden = false;
  };
$("again").onclick = resetBlind;
async function loadBench() {
  if (!state.eval) state.eval = await request("/api/results");
  const table = el("table"),
    head = el("tr");
  for (const v of [
    "版本 / 策略",
    "端到端",
    "完整工具路径",
    "HTTP 成功 / 尝试",
    "额外占用",
    "P95 毫秒",
  ])
    head.append(el("th", v));
  table.append(head);
  const { first, current } = state.eval;
  for (const [label, rec] of [
    ["首版 · 先查回执", first.summary.reconcile],
    ["当前 · 一次调用", current.summary.once],
    ["当前 · 直接重发", current.summary.blind],
    ["当前 · 先查回执", current.summary.reconcile],
  ]) {
    const row = el("tr");
    for (const t of [
      label,
      rec.complete + "/" + rec.cases,
      rec.route + "/" + rec.cases,
      rec.good + "/" + rec.calls,
      rec.extraUnits + " 件",
      String(rec.p95Ms),
    ])
      row.append(el("td", t));
    table.append(row);
  }
  const wrap = el("div", undefined, "scroll");
  wrap.append(table);
  $("benchSummary").replaceChildren(wrap);
  ablate();
  list();
}
function ablate() {
  if (!state.eval) return;
  const labels = {
    new_key: "新键直接重发",
    same_key: "原键直接重发",
    receipt_then_same_key: "查回执后按需重发",
  };
  const table = el("table"),
    head = el("tr");
  for (const v of ["恢复方式", "写 / 查回执请求", "助手状态", "实际预留"])
    head.append(el("th", v));
  table.append(head);
  for (const r of state.eval.ablation.rows.filter(
    (x) => x.fault === $("counter").value,
  )) {
    const row = el("tr");
    for (const t of [
      labels[r.policy],
      String(r.requests),
      r.status === "held" ? "已确认" : "待核验",
      r.reserved + " 件",
    ])
      row.append(el("td", t));
    table.append(row);
  }
  const block = el("div", undefined, "scroll");
  block.append(table);
  $("ablation").replaceChildren(block);
}
$("counter").onchange = ablate;
function list() {
  const data = state.eval;
  if (!data) return;
  const box = $("rows");
  box.replaceChildren();
  const old = new Set(data.first.summary.reconcile.failed),
    blind = new Set(data.current.summary.blind.failed),
    filter = $("filter").value;
  for (const c of data.cases) {
    if (
      (filter === "regression" && !old.has(c.id)) ||
      (filter === "blind" && !blind.has(c.id))
    )
      continue;
    const b = el("button", undefined, "case-row");
    b.append(el("strong", c.id + "  " + c.group), el("small", c.text));
    b.onclick = () => {
      $("ticket").value = c.text;
      $("fault").value = c.fault;
      $("budget").value = String(c.budget);
      location.hash = "lab";
      show("lab");
      run();
    };
    box.append(b);
  }
}
$("filter").onchange = list;
$("report").onclick = () => {
  if (state.eval) file("dispatch-benchmark.json", state.eval);
};
async function init() {
  $("run").disabled = true;
  try {
    state.config = await request("/api/config");
    for (const [k, n] of Object.entries(state.config.faultLabels)) {
      const o = el("option", n);
      o.value = k;
      $("fault").append(o);
    }
    $("runtime").textContent =
      state.config.transport + " · 确定性工具路由 · 无需密钥";
    $("run").disabled = false;
    await run();
    show(location.hash.slice(1) || "lab");
  } catch (e) {
    $("notice").textContent = "加载失败。" + e.message;
  }
}
init();

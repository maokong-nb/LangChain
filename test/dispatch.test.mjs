import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { compare, inProcess } from "../src/experiment.mjs";
import { example, parse } from "../src/catalog.mjs";
import { runAgent } from "../src/agent.mjs";
import { liveRouter, metering } from "../src/model.mjs";
import { evaluate } from "../bench/evaluate.mjs";
import { apiHandler } from "../src/http.mjs";

test("the same 504 observation has two different ledger effects; receipt reconciliation separates them", async () => {
  const run = async (fault) =>
    (await compare({ text: example, fault, budget: 2 })).runs;
  const [lost, never] = await Promise.all([run("after"), run("before")]);
  assert.deepEqual(
    lost.map((r) => r.reserved),
    [2, 4, 2],
  );
  assert.deepEqual(
    never.map((r) => r.reserved),
    [0, 2, 2],
  );
  assert.deepEqual(lost[2].trace[2].output, never[2].trace[2].output);
  const writes = never[2].trace.filter((x) => x.tool === "reserve_parts");
  assert.equal(writes[0].args.key, writes[1].args.key);
  assert.equal(lost[1].receipts.length, 2);
});
test("simultaneous identical writes share a receipt; a key cannot be reused for a different quantity", async () => {
  const { send, world } = inProcess("clean"),
    args = {
      sku: "PWR-24",
      depot: "SZ",
      quantity: 2,
      operation: "wo-test",
      key: "stable",
    };
  const replies = await Promise.all([
    send("reserve_parts", args),
    send("reserve_parts", args),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 201]);
  assert.equal(world.stock["PWR-24"].SZ, 6);
  assert.equal(
    (await send("reserve_parts", { ...args, quantity: 3 })).status,
    409,
  );
  assert.equal(world.ledger.length, 1);
});
test("negative authorization, hypothetical instructions and bad quantities cannot spend inventory", async () => {
  for (const text of [
    "深圳 2 块电源板多久能到？先别预留",
    "深圳 2 块电源板，先别预留",
    "如果价格低，为深圳预留 2 块电源板",
    "为广州预留 -2 个风扇",
    "为广州预留 2.5 个风扇",
  ]) {
    const { runs } = await compare({ text, fault: "clean", budget: 2 });
    assert.ok(
      runs.every(
        (r) =>
          r.reserved === 0 && !r.trace.some((t) => t.tool === "reserve_parts"),
      ),
      text,
    );
  }
  assert.equal(parse("为深圳预留 2 个风扇，下午三点半前送达").deadline, 930);
});
test("unavailable receipts and exhausted budgets distinguish unknown from proved absence", async () => {
  const one = async (fault, budget) =>
    (
      await compare(
        { text: example, fault, budget },
        { policies: ["reconcile"] },
      )
    ).runs[0];
  const dark = await one("dark", 1);
  assert.equal(dark.status, "uncertain");
  assert.equal(dark.trace.filter((x) => x.tool === "reserve_parts").length, 1);
  assert.equal((await one("before", 0)).status, "not_held");
  assert.equal((await one("after", 0)).status, "held");
  const rate = await one("rate", 1);
  assert.equal(rate.logicalWaitSeconds, 2);
  assert.equal(rate.status, "held");
});
test("a model tool choice with no observed authorization is blocked before any side effect", async () => {
  const result = await runAgent(
    { text: "查风扇库存", fault: "clean", budget: 2 },
    "reconcile",
    inProcess("clean"),
    {
      model: async () => ({
        name: "reserve_parts",
        args: { sku: "FAN-08", depot: "SZ", quantity: 2 },
      }),
    },
  );
  assert.equal(result.status, "model_error");
  assert.equal(result.modelRejected, 2);
  assert.equal(result.trace.length, 0);
  assert.equal(result.reserved, 0);
});
test("the actual ChatOpenAI client can select a structured tool through a local protocol fixture", async () => {
  let posted = null;
  const provider = createServer(async (req, res) => {
    const b = [];
    for await (const chunk of req) b.push(chunk);
    posted = JSON.parse(Buffer.concat(b));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "fixture",
        object: "chat.completion",
        created: 0,
        model: "dispatch-fixture",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "t1",
                  type: "function",
                  function: {
                    name: "get_stock",
                    arguments: JSON.stringify({ sku: "FAN-08" }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }),
    );
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  try {
    const env = {
      MODEL_NAME: "dispatch-fixture",
      MODEL_API_KEY: "local-fixture",
      MODEL_BASE_URL: "http://127.0.0.1:" + provider.address().port + "/v1",
    };
    const r = await runAgent(
      { text: "查风扇库存", fault: "clean", budget: 2 },
      "reconcile",
      inProcess("clean"),
      { model: liveRouter(env) },
    );
    assert.equal(r.status, "stock");
    assert.equal(posted.tools.length, 4);
    assert.equal(r.modelRejected, 0);
    assert.equal(metering(r.modelTurns, {}).estimatedCny, null);
    assert.equal(
      metering(r.modelTurns, {
        MODEL_INPUT_CNY_PER_M: "1",
        MODEL_OUTPUT_CNY_PER_M: "2",
      }).estimatedCny,
      0.00003,
    );
  } finally {
    await new Promise((resolve) => provider.close(resolve));
  }
});
test("HTTP contracts reject unknown faults; public comparisons never use the provider", async () => {
  const api = apiHandler(inProcess, "test");
  const post = (value) =>
    api(
      new Request("http://test/api/compare", { method: "POST", body: value }),
    );
  assert.equal((await post("{")).status, 400);
  assert.equal(
    (await post(JSON.stringify({ text: "查库存", fault: "invalid" }))).status,
    422,
  );
  const r = await (
    await post(JSON.stringify({ text: example, fault: "after" }))
  ).json();
  assert.equal(r.runs.length, 3);
  assert.ok(
    r.runs.every((x) => x.mode === "rules" && x.modelTurns.length === 0),
  );
});
test("all 36 hand-labelled cases pass over real loopback HTTP; both baselines still expose failures", async () => {
  const { summary } = await evaluate("test");
  assert.equal(summary.reconcile.cases, 36);
  assert.equal(summary.reconcile.complete, 36);
  assert.equal(summary.reconcile.route, 36);
  assert.equal(summary.once.complete, 27);
  assert.equal(summary.blind.complete, 29);
  assert.equal(summary.blind.extraUnits, 4);
});

import { compare } from "./experiment.mjs";
import { faultLabels, policyLabels, toolLabels, example } from "./catalog.mjs";
import { resultNames, options } from "./agent.mjs";
import { benchmark } from "../bench/public.mjs";
const json = (data, code = 200) =>
  Response.json(data, {
    status: code,
    headers: { "Cache-Control": "no-store" },
  });
export function apiHandler(open, transport) {
  return async (req) => {
    const p = new URL(req.url).pathname;
    if (p === "/api/health" && req.method === "GET")
      return json({
        ok: true,
        transport,
        router: "LangChain / rules",
        modelApiCalls: 0,
      });
    if (p === "/api/config" && req.method === "GET")
      return json({
        faultLabels,
        policyLabels,
        toolLabels,
        resultNames,
        example,
        transport,
      });
    if (p === "/api/results" && req.method === "GET") return json(benchmark);
    if (p === "/api/compare" && req.method === "POST") {
      try {
        if (Number(req.headers.get("content-length")) > 4096)
          return json({ error: "输入过长" }, 413);
        const raw = await req.text();
        if (raw.length > 4096) return json({ error: "输入过长" }, 413);
        const input = options.safeParse(JSON.parse(raw));
        if (!input.success)
          return json(
            { error: "请输入 1 至 260 字、有效故障及 0–3 的预算。" },
            422,
          );
        return json({ ...(await compare(input.data, { open })), transport });
      } catch (error) {
        return json(
          {
            error:
              error instanceof SyntaxError
                ? "正文应为 JSON"
                : "运行失败，请重试。",
          },
          error instanceof SyntaxError ? 400 : 500,
        );
      }
    }
    return json({ error: "接口或请求方法不存在" }, 404);
  };
}

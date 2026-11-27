import current from "./results.json" with { type: "json" };
import first from "./results-v1.json" with { type: "json" };
import { cases } from "./cases.mjs";
import ablation from "./idempotency-results.json" with { type: "json" };
export const benchmark = {
  ablation,
  current,
  first: {
    label: first.label,
    summary: first.summary,
    executedAt: first.executedAt,
  },
  cases,
};

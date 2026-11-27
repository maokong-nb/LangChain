import { options, runAgent } from "./agent.mjs";
import { policyLabels } from "./catalog.mjs";
import { internalAdapter, makeWorld } from "./warehouse.mjs";

export function inProcess(fault) {
  const world = makeWorld(fault);
  return { world, send: internalAdapter(world), close() {} };
}
export async function compare(
  raw,
  {
    open = inProcess,
    settings = {},
    policies = Object.keys(policyLabels),
  } = {},
) {
  const input = options.parse(raw);
  const runs = [];
  for (const policy of policies) {
    const backend = await open(input.fault);
    try {
      runs.push(await runAgent(input, policy, backend, settings));
    } finally {
      await backend.close();
    }
  }
  return {
    input,
    runs,
    clock: "14:00",
    mode: settings.model ? "live-model" : "rules",
  };
}

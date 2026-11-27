import { compare } from "./experiment.mjs";
import { openWarehouse } from "./loopback.mjs";
import { liveRouter, metering } from "./model.mjs";
import { example } from "./catalog.mjs";
const args = process.argv.slice(2);
function value(name, fallback) {
  const ix = args.indexOf(name);
  return ix < 0 ? fallback : args[ix + 1];
}
let backend;
try {
  const model = args.includes("--live") ? liveRouter() : null;
  backend = await openWarehouse();
  const { runs } = await compare(
    {
      text: value("--text", example),
      fault: value("--fault", "after"),
      budget: Number(value("--budget", "2")),
    },
    {
      open: backend.open,
      settings: { model, realWait: args.includes("--wall-wait") },
      policies: ["reconcile"],
    },
  );
  const result = runs[0];
  console.log(
    JSON.stringify(
      { ...result, metering: metering(result.modelTurns) },
      null,
      2,
    ),
  );
  if (result.status === "model_error") process.exitCode = 2;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (backend) await backend.close();
}

// Isolate write recovery from natural-language routing. Compare the strongest alternative too.
import { writeFile } from "node:fs/promises";
import { openWarehouse } from "../src/loopback.mjs";
const store = await openWarehouse(),
  rows = [];
try {
  for (const fault of ["after", "before", "dark"]) {
    for (const policy of ["new_key", "same_key", "receipt_then_same_key"]) {
      const { world, send, close } = store.open(fault),
        events = [];
      const payload = {
        operation: "ABL-1",
        sku: "PWR-24",
        depot: "SZ",
        quantity: 2,
      };
      async function call(name, args) {
        const r = await send(name, args),
          d = await r.json();
        events.push({ name, args, status: r.status, body: d });
        return { status: r.status, data: d };
      }
      try {
        const first = await call("reserve_parts", {
          ...payload,
          key: "ABL-1-stable",
        });
        let status = "uncertain";
        if (first.status === 504) {
          if (policy === "receipt_then_same_key") {
            const read = await call("get_receipt", {
              operation: payload.operation,
            });
            if (read.status === 200 && read.data.receipts.length === 1)
              status = "held";
            if (read.status === 200 && read.data.receipts.length === 0) {
              const retry = await call("reserve_parts", {
                ...payload,
                key: "ABL-1-stable",
              });
              if (retry.status < 300) status = "held";
            }
          } else {
            const retry = await call("reserve_parts", {
              ...payload,
              key: policy === "new_key" ? "ABL-1-second" : "ABL-1-stable",
            });
            if (retry.status < 300) status = "held";
          }
        }
        rows.push({
          fault,
          policy,
          status,
          requests: events.length,
          reserved: world.ledger.reduce((n, x) => n + x.quantity, 0),
          receipts: world.ledger.length,
          events,
        });
      } finally {
        close();
      }
    }
  }
} finally {
  await store.close();
}
await writeFile(
  process.argv[2] || new URL("./idempotency-results.json", import.meta.url),
  JSON.stringify(
    { transport: "loopback TCP HTTP", requested: 2, rows },
    null,
    2,
  ) + "\n",
);
console.table(
  rows.map(({ fault, policy, status, requests, reserved }) => ({
    fault,
    policy,
    status,
    requests,
    reserved,
  })),
);

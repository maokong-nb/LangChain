import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { makeWorld, warehouse } from "./warehouse.mjs";

// This second HTTP listener is private to the process. Individual runs own independent stock.
export async function openWarehouse() {
  const worlds = new Map();
  const server = createServer(async (req, res) => {
    const [, id, tool] = req.url.split("/");
    const world = worlds.get(id);
    if (!world || req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await warehouse(
        new Request("http://warehouse.local/" + tool, {
          method: "POST",
          body: Buffer.concat(chunks),
        }),
        world,
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      res.writeHead(400);
      res.end('{"error":"invalid_request"}');
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const base = "http://127.0.0.1:" + server.address().port;
  return {
    open(fault) {
      const id = randomUUID(),
        world = makeWorld(fault);
      worlds.set(id, world);
      return {
        world,
        send: (name, args) =>
          fetch(base + "/" + id + "/" + name, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args),
          }),
        close: () => worlds.delete(id),
      };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

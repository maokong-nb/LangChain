import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { openWarehouse } from "./loopback.mjs";
import { apiHandler } from "./http.mjs";
const warehouse = await openWarehouse();
const api = apiHandler(warehouse.open, "loopback TCP HTTP");
const assets = {
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (assets[path] && req.method === "GET") {
      const [file, type] = assets[path];
      res.writeHead(200, { "content-type": type + "; charset=utf-8" });
      res.end(await readFile(new URL("../web/" + file, import.meta.url)));
      return;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 4096) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request("http://localhost" + req.url, {
      method: req.method,
      headers: req.headers,
      ...(["GET", "HEAD"].includes(req.method)
        ? {}
        : { body: Buffer.concat(chunks) }),
    });
    const response = await api(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
const port = Number(process.env.PORT || 8787),
  host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () =>
  console.log("Dispatch Lab http://" + host + ":" + server.address().port),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () =>
    server.close(async () => {
      await warehouse.close();
      process.exit(0);
    }),
  );

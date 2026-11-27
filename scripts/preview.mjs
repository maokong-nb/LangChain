// Serves the exact bundled Worker used in production for browser QA.
import { createServer } from "node:http";
import worker from "../dist/server/index.js";
const ix = process.argv.indexOf("--port"),
  port = Number(ix < 0 ? process.env.PORT || 5173 : process.argv[ix + 1]);
createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request("http://preview.local" + req.url, {
      method: req.method,
      headers: req.headers,
      ...(["GET", "HEAD"].includes(req.method)
        ? {}
        : { body: Buffer.concat(chunks) }),
    });
    const reply = await worker.fetch(request);
    res.writeHead(reply.status, Object.fromEntries(reply.headers));
    res.end(await reply.text());
  } catch {
    res.writeHead(500);
    res.end();
  }
}).listen(port, "0.0.0.0");

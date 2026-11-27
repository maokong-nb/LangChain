import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const js = new URL("../web/app.js", import.meta.url);
await build({
  entryPoints: ["web/worker.mjs"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".html": "text", ".css": "text" },
  plugins: [
    {
      name: "client-source",
      setup(b) {
        b.onResolve({ filter: /app\.js\?raw$/ }, () => ({
          path: "client",
          namespace: "inline-js",
        }));
        b.onLoad({ filter: /.*/, namespace: "inline-js" }, async () => ({
          contents: await readFile(js, "utf8"),
          loader: "text",
        }));
      },
    },
  ],
});

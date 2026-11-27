import page from "./index.html";
import style from "./style.css";
import client from "./app.js?raw";
import { apiHandler } from "../src/http.mjs";
import { inProcess } from "../src/experiment.mjs";
const api = apiHandler(inProcess, "Worker 内部 Request / Response");
const assets = {
  "/": [page, "text/html"],
  "/app.js": [client, "text/javascript"],
  "/style.css": [style, "text/css"],
};
export default {
  async fetch(request) {
    const p = new URL(request.url).pathname;
    if (Object.hasOwn(assets, p) && request.method === "GET") {
      const [content, mime] = assets[p];
      return new Response(content, {
        headers: {
          "Content-Type": mime + "; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }
    return api(request);
  },
};

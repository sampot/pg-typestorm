/**
 * SAM functions for pg-typestorm: the only backend the game needs is the
 * sandbox KV store behind `/api/kv/{key}` (high score + preferences).
 */

const KV_PATH = /^\/api\/kv\/([^/]+)$/u;

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(KV_PATH);
    if (!match) return json({ error: "not_found", path: url.pathname }, 404);

    const kv = env?.KV;
    if (!kv) return json({ error: "kv_unavailable" }, 503);

    const key = decodeURIComponent(match[1]);
    const method = request.method.toUpperCase();

    if (method === "GET") {
      const value = await kv.get(key, "text");
      if (value == null) return new Response(null, { status: 404 });
      return new Response(typeof value === "string" ? value : String(value), {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    if (method === "PUT") {
      await kv.put(key, await request.text());
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") {
      await kv.delete(key);
      return new Response(null, { status: 204 });
    }
    return json({ error: "method_not_allowed", method }, 405);
  },
};

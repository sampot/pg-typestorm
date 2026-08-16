import { describe, expect, it, vi } from "vitest";
import handler from "./functions.js";
import {
  EMPTY_PROGRESS,
  PROGRESS_KEY,
  loadProgress,
  mergeProgress,
  saveProgress,
} from "./persist.js";

const okResponse = (body) => new Response(body, { status: 200 });

/** Minimal stand-in for the sandbox `env.KV` binding. */
function fakeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

describe("progress record", () => {
  it("keeps the best score, combo and wave across runs", () => {
    const first = mergeProgress(null, { score: 1200, bestCombo: 18, wave: 3, outcome: "lost" });
    const second = mergeProgress(first, { score: 400, bestCombo: 25, wave: 2, outcome: "won" });
    expect(second.best).toBe(1200);
    expect(second.bestCombo).toBe(25);
    expect(second.bestWave).toBe(3);
    expect(second.plays).toBe(2);
    expect(second.wins).toBe(1);
    expect(typeof second.updatedAt).toBe("string");
  });

  it("reads a stored record through /api/kv", async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse(JSON.stringify({ best: 4200 })));
    const progress = await loadProgress(fetcher);
    expect(fetcher).toHaveBeenCalledWith(PROGRESS_KEY);
    expect(progress.best).toBe(4200);
    expect(progress.plays).toBe(0);
  });

  it("falls back to an empty record when the host has no key or fails", async () => {
    expect(await loadProgress(vi.fn().mockResolvedValue(new Response(null, { status: 404 })))).toEqual(EMPTY_PROGRESS);
    expect(await loadProgress(vi.fn().mockRejectedValue(new Error("offline")))).toEqual(EMPTY_PROGRESS);
    expect(await loadProgress(vi.fn().mockResolvedValue(okResponse("")))).toEqual(EMPTY_PROGRESS);
  });

  it("PUTs the record and never throws when the host is missing", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const record = mergeProgress(null, { score: 10 });
    await saveProgress(record, fetcher);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(PROGRESS_KEY);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).best).toBe(10);
    await expect(saveProgress(record, vi.fn().mockRejectedValue(new Error("no host")))).resolves.toBe(record);
  });
});

describe("functions.js KV routes", () => {
  const call = (method, path, body, kv = fakeKv()) =>
    handler.fetch(new Request(`https://sam.local${path}`, { method, body }), { KV: kv });

  it("round-trips a value", async () => {
    const kv = fakeKv();
    expect((await call("PUT", "/api/kv/pg-typestorm:progress", '{"best":7}', kv)).status).toBe(204);
    const read = await call("GET", "/api/kv/pg-typestorm:progress", undefined, kv);
    expect(read.status).toBe(200);
    expect(await read.text()).toBe('{"best":7}');
  });

  it("returns 404 for a missing key and for unknown paths", async () => {
    expect((await call("GET", "/api/kv/nope")).status).toBe(404);
    expect((await call("GET", "/api/other")).status).toBe(404);
  });

  it("deletes a key", async () => {
    const kv = fakeKv({ "pg-typestorm:progress": "1" });
    expect((await call("DELETE", "/api/kv/pg-typestorm:progress", undefined, kv)).status).toBe(204);
    expect(kv.store.size).toBe(0);
  });

  it("rejects unsupported methods and reports a missing binding", async () => {
    expect((await call("PATCH", "/api/kv/x", "1")).status).toBe(405);
    const response = await handler.fetch(new Request("https://sam.local/api/kv/x"), {});
    expect(response.status).toBe(503);
  });
});

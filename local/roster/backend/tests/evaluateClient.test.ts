import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { EvaluateClient } from "../src/evaluateClient.js";

describe("EvaluateClient", () => {
  it("does not report Evaluate healthy when a 200 response is not its JSON health contract", async () => {
    const client = new EvaluateClient("http://evaluate/api", vi.fn(async () => new Response("<html>upstream proxy</html>", { status: 200 })) as typeof fetch);
    await expect(client.health()).resolves.toBe(false);
    const valid = new EvaluateClient("http://evaluate/api", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch);
    await expect(valid.health()).resolves.toBe(true);
  });

  it("sends the Evaluate site origin for proxied login and logout in production", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new EvaluateClient("https://evaluate.example/api", fetchMock as typeof fetch);
    await client.login({ username: "manager", password: "example" });
    await client.logout("roster_private=do-not-forward; evaluate_molly_session=opaque");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", headers: { "content-type": "application/json", origin: "https://evaluate.example" } });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST", headers: { origin: "https://evaluate.example", cookie: "evaluate_molly_session=opaque" } });
  });

  it("uses the configured public Evaluate origin when the upstream API uses an internal address", async () => {
    vi.stubEnv("EVALUATE_APP_ORIGIN", "https://evaluate-public.example");
    try {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const client = new EvaluateClient("http://evaluate-internal:4000/api", fetchMock as typeof fetch);
      await client.logout("evaluate_molly_session=opaque");
      expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ origin: "https://evaluate-public.example" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("forwards the HttpOnly cookie and returns verified auth", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://evaluate/api/auth/me");
      expect(init?.method).toBeUndefined();
      return new Response(JSON.stringify({ user: { id: "u1", accountId: "u1", userId: "u1", username: "manager", displayName: "Manager", role: "STORE_EVALUATOR", storeIds: ["store-1"], stores: [{ id: "store-1", name: "Hurstville" }], canAccessAllStores: false } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = new EvaluateClient("http://evaluate/api", fetchMock as typeof fetch);
    await expect(client.me("evaluate_molly_session=opaque")).resolves.toMatchObject({ role: "STORE_EVALUATOR", storeIds: ["store-1"] });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ cookie: "evaluate_molly_session=opaque" });
  });

  it("fails closed when Evaluate returns a successful but incomplete auth user", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: {
      id: "u1", accountId: "u1", userId: "u1", username: "manager", displayName: "Manager",
      role: "STORE_EVALUATOR", stores: [{ id: "store-1", name: "Hurstville" }], canAccessAllStores: false,
    } }), { status: 200 }));
    const client = new EvaluateClient("http://evaluate/api", fetchMock as typeof fetch);
    await expect(client.me("evaluate_molly_session=opaque")).rejects.toMatchObject({ status: 503 });
  });

  it("rejects a contradictory administrator scope from Evaluate", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: {
      id: "u1", accountId: "u1", userId: "u1", username: "manager", displayName: "Manager",
      role: "ADMIN", storeIds: [], stores: [], canAccessAllStores: false,
    } }), { status: 200 }));
    const client = new EvaluateClient("http://evaluate/api", fetchMock as typeof fetch);
    await expect(client.me("evaluate_molly_session=opaque")).rejects.toMatchObject({ status: 503 });
  });

  it("forwards only the Evaluate session cookie from a browser Cookie header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ contractVersion: "1.3.0" }), { status: 200 }));
    const client = new EvaluateClient("http://evaluate/api", fetchMock as typeof fetch);
    await client.integration("/stores", "roster_private=do-not-forward; evaluate_molly_session=opaque; analytics=also-private");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ cookie: "evaluate_molly_session=opaque" });
    expect(() => client.integration("/stores", "roster_private=do-not-forward")).toThrow("请先登录");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not accept missing cookies", async () => {
    const client = new EvaluateClient("http://evaluate/api", vi.fn() as typeof fetch);
    await expect(client.me(undefined)).rejects.toMatchObject({ status: 401 });
  });

  it("forwards only the Evaluate session to the store job catalog", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    const client = new EvaluateClient("http://evaluate/api", fetchMock as typeof fetch);
    await client.storeJobs("store 1", "analytics=private; evaluate_molly_session=opaque");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://evaluate/api/store-jobs?storeId=store%201");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ cookie: "evaluate_molly_session=opaque" });
  });

  it("propagates an expired upstream session as 401", async () => {
    const client = new EvaluateClient("http://evaluate/api", vi.fn(async () => new Response(JSON.stringify({ message: "登录状态已失效" }), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch);
    await expect(client.me("evaluate_molly_session=expired")).rejects.toMatchObject({ status: 401 });
  });

  it("normalizes upstream network failures as a safe 503", async () => {
    const client = new EvaluateClient("http://evaluate/api", vi.fn(async () => { throw new Error("connect ECONNREFUSED secret-host"); }) as typeof fetch);
    await expect(client.integration("/stores", "evaluate_molly_session=opaque")).rejects.toMatchObject({ status: 503, message: "Evaluate Molly 暂时无法连接" });
  });

  it("times out when Evaluate sends headers but never finishes its JSON body", async () => {
    let stopBody = () => {};
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"user":'));
        stopBody = () => controller.error(new Error("test cleanup"));
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      },
    }), { status: 200 }));
    const client = new EvaluateClient("http://evaluate/api", fetchMock as typeof fetch, 40);
    let timer!: ReturnType<typeof setTimeout>;
    const outcome = await Promise.race([
      client.me("evaluate_molly_session=opaque").then(() => 200, (error: { status?: number }) => error.status ?? 500),
      new Promise<number>((resolve) => { timer = setTimeout(() => resolve(0), 250); }),
    ]);
    clearTimeout(timer);
    if (outcome === 0) stopBody();
    expect(outcome).toBe(503);
  });

  it("aborts a real HTTP response with a stalled body", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"user":');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No local test address");
      const client = new EvaluateClient(`http://127.0.0.1:${address.port}/api`, fetch, 200);
      await expect(client.me("evaluate_molly_session=opaque")).rejects.toMatchObject({ status: 503 });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { HttpPeer } from "./http_peer.js";
import type { CallResult, PeerManagerHandle } from "../peers/peer.js";

const OK_RESPONSE = JSON.stringify({ status: 200, contentType: "text/plain", body: "ok" });

class FakeHandle implements PeerManagerHandle {
  readonly calls: { funcName: string; inData: string }[] = [];
  next: CallResult = { ok: true, value: OK_RESPONSE };

  async invokeFunction(funcName: string, inData: string): Promise<CallResult> {
    this.calls.push({ funcName, inData });
    return this.next;
  }

  async describeInterface(): Promise<CallResult> {
    return { ok: true, value: '{"name":"api","funcs":[]}' };
  }
}

describe("HttpPeer", () => {
  let server: Server;
  let peer: HttpPeer;
  let handle: FakeHandle;
  let base: string;
  const HANDLER = "handleRequest_public";

  beforeEach(async () => {
    handle = new FakeHandle();
    server = createServer();
    peer = new HttpPeer(server, handle, HANDLER);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => peer.close());

  it("routes any HTTP request to the handler function with request details", async () => {
    handle.next = {
      ok: true,
      value: JSON.stringify({ status: 200, contentType: "text/html", body: "<h1>hi</h1>" }),
    };
    const res = await fetch(`${base}/hello?x=1`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html");
    assert.equal(await res.text(), "<h1>hi</h1>");
    assert.equal(handle.calls.length, 1);
    assert.equal(handle.calls[0].funcName, HANDLER);
    const payload = JSON.parse(handle.calls[0].inData) as Record<string, string>;
    assert.equal(payload.method, "GET");
    assert.equal(payload.path, "/hello");
    assert.deepEqual(payload.query, { x: "1" });
  });

  it("includes the request body in the payload", async () => {
    await fetch(`${base}/submit`, { method: "POST", body: "hello world" });
    const payload = JSON.parse(handle.calls[0].inData) as Record<string, string>;
    assert.equal(payload.body, "hello world");
  });

  it("includes headers as a plain object in the payload", async () => {
    await fetch(`${base}/`, { headers: { "x-custom": "test-value" } });
    const payload = JSON.parse(handle.calls[0].inData) as Record<string, unknown>;
    assert.equal(typeof payload.headers, "object");
    assert.equal((payload.headers as Record<string, string>)["x-custom"], "test-value");
  });

  it("uses status, contentType, and body from the handler response", async () => {
    handle.next = {
      ok: true,
      value: JSON.stringify({ status: 201, contentType: "application/json", body: '{"ok":true}' }),
    };
    const res = await fetch(`${base}/data`, { method: "POST" });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.equal(await res.text(), '{"ok":true}');
  });

  it("maps invokeFunction errors onto HTTP statuses", async () => {
    const cases: [string, number][] = [
      ['peer "x" has no interface assigned', 403],
      [`no function named "${HANDLER}"`, 404],
      ["input is not valid JSON", 400],
      ["boom at runtime", 500],
    ];
    for (const [error, status] of cases) {
      handle.next = { ok: false, error };
      const res = await fetch(`${base}/`);
      assert.equal(res.status, status, `"${error}" -> ${status}`);
      assert.equal(await res.text(), error);
    }
  });

  it("is inbound-only: sendRpc always fails", async () => {
    const res = await peer.sendRpc();
    assert.equal(res.ok, false);
    assert.match(res.ok ? "" : res.error, /inbound-only/);
  });
});

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PortsManager } from "./ports_manager.js";
import { PeerManager } from "../peers/peer_manager.js";
import { FunctionManager } from "../functions/function_manager.js";

describe("PortsManager", () => {
  let dir: string;
  let fm: FunctionManager;
  let peers: PeerManager;
  let ports: PortsManager;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "goblin-ports-"));
    fm = new FunctionManager(dir, { execTimeoutMs: 5000 });
    await fm.start();
    peers = new PeerManager(dir, fm);
    await peers.start();
    ports = new PortsManager(dir, peers, fm);
    await ports.start();
  });

  afterEach(async () => {
    for (const name of ports.listListening()) ports.closePort(name);
    await fm.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it("opens a port and auto-creates the handler function and interface", async () => {
    await ports.openPort("public", { port: 0 });
    assert.deepEqual(ports.listListening(), ["public"]);
    assert.ok(fm.getFunc("handleRequest_public"), "handler function should exist");
    assert.ok(fm.getInterface("http_public"), "http interface should exist");
    assert.equal(peers.getPeerInterface("public"), "http_public");
    assert.equal(peers.isConnected("public"), true);
  });

  it("default handler returns a hello-world response", async () => {
    await ports.openPort("public", { port: 0 });
    const res = await fetch(`http://127.0.0.1:${ports.getPort("public")}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Hello from Goblin/);
  });

  it("routes full request details to the handler function", async () => {
    await ports.openPort("public", { port: 0 });
    await fm.modifyFunc(
      "handleRequest_public",
      `export async function handle(input) {
        return { status: 200, contentType: "text/plain", body: input.method + " " + input.path };
      }`,
    );
    const res = await fetch(`http://127.0.0.1:${ports.getPort("public")}/hello`, {
      method: "POST",
      body: "",
    });
    assert.equal(await res.text(), "POST /hello");
  });

  it("handler can return custom status codes and content types", async () => {
    await ports.openPort("public", { port: 0 });
    await fm.modifyFunc(
      "handleRequest_public",
      `export async function handle(input) {
        return { status: 404, contentType: "application/json", body: '{"error":"not found"}' };
      }`,
    );
    const res = await fetch(`http://127.0.0.1:${ports.getPort("public")}/missing`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.equal(await res.text(), '{"error":"not found"}');
  });

  it("rejects opening the same name twice while listening", async () => {
    await ports.openPort("public", { port: 0 });
    await assert.rejects(() => ports.openPort("public", { port: 0 }), /already listening/);
  });

  it("rejects an invalid port name", async () => {
    await assert.rejects(() => ports.openPort("../evil", { port: 0 }), /invalid peer name/);
  });

  it("closePort stops serving but keeps the peer, interface, and handler function", async () => {
    await ports.openPort("public", { port: 0 });
    const port = ports.getPort("public")!;
    ports.closePort("public");

    assert.deepEqual(ports.listListening(), []);
    assert.equal(peers.getPeerInterface("public"), "http_public");
    assert.ok(fm.getFunc("handleRequest_public"), "function should survive closePort");
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
  });

  it("removePort forgets the port, peer, function, and interface", async () => {
    await ports.openPort("public", { port: 0 });
    await ports.removePort("public");

    assert.deepEqual(ports.listListening(), []);
    assert.equal(peers.getPeer("public"), undefined);
    assert.equal(fm.getFunc("handleRequest_public"), undefined);
    assert.equal(fm.getInterface("http_public"), undefined);
  });
});

describe("PortsManager persistence", () => {
  it("reopens persisted ports and restores their handler on restart", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "goblin-ports-persist-"));
    try {
      // First run: open a port, close it (simulating shutdown).
      const fm1 = new FunctionManager(dir, { execTimeoutMs: 5000 });
      await fm1.start();
      const peers1 = new PeerManager(dir, fm1);
      await peers1.start();
      const ports1 = new PortsManager(dir, peers1, fm1);
      await ports1.start();
      await ports1.openPort("public", { port: 0 });
      ports1.closePort("public");
      await fm1.stop();

      // Second run: fresh managers over the same dir — everything restores.
      const fm2 = new FunctionManager(dir, { execTimeoutMs: 5000 });
      await fm2.start();
      const peers2 = new PeerManager(dir, fm2);
      await peers2.start();
      const ports2 = new PortsManager(dir, peers2, fm2);
      await ports2.start();
      await ports2.openAllExisting();

      assert.deepEqual(ports2.listListening(), ["public"]);
      assert.equal(peers2.getPeerInterface("public"), "http_public");
      const res = await fetch(`http://127.0.0.1:${ports2.getPort("public")}/`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /Hello from Goblin/);

      ports2.closePort("public");
      await fm2.stop();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

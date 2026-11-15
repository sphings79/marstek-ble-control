import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeWriteFrame,
  decodeNotifyFrame,
  parseHello,
  isSupportedVersion,
} from "../src/lib/bridge/BridgeProtocol.ts";
import { BridgeSocket } from "../src/lib/bridge/BridgeSocket.ts";
import { BridgeTransport } from "../src/lib/transport/BridgeTransport.ts";
import { ConnectionState } from "../src/lib/ConnectionState.ts";

class FakeSocket {
  readyState = 1;
  binaryType = "";
  sent = [];
  closed = false;
  listeners = {};
  send(data) { this.sent.push(data); }
  close() { this.closed = true; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
}


async function setup() {
  const fake = new FakeSocket();
  const socket = new BridgeSocket(3, () => fake);
  const transports = [0, 1, 2].map((slot) => new BridgeTransport(slot, socket));
  const log = transports.map(() => ({ states: [], notes: [], rssi: [] }));
  transports.forEach((tr, i) =>
    tr.setCallbacks({
      onNotify: (b) => log[i].notes.push([...b]),
      onStateChange: (s, m) => log[i].states.push([s, m]),
      onRssi: (r) => log[i].rssi.push(r),
      onDisconnected: () => log[i].states.push(["disc"]),
    }),
  );
  await socket.open();
  return { fake, socket, transports, log };
}

const hello = (version, slots) => JSON.stringify({ t: "hello", version, slots });

test("write frame carries slot then write kind then payload", () => {
  assert.deepEqual([...encodeWriteFrame(2, new Uint8Array([9, 8]), true)], [2, 1, 9, 8]);
  assert.deepEqual([...encodeWriteFrame(0, new Uint8Array([7]), false)], [0, 0, 7]);
});

test("notify frame is split into slot and payload", () => {
  const frame = decodeNotifyFrame(new Uint8Array([1, 0xaa, 0xbb]).buffer);
  assert.equal(frame.slot, 1);
  assert.deepEqual([...frame.payload], [0xaa, 0xbb]);
  assert.equal(decodeNotifyFrame(new ArrayBuffer(0)), null);
});

test("hello parsing keeps unbound slots as null", () => {
  const parsed = parseHello({
    version: 2,
    slots: [{ name: "MST_VNSD_1234", address: "aa:bb" }, null, { name: "x", address: "" }],
  });
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.slots, [{ name: "MST_VNSD_1234", address: "aa:bb" }, null, null]);
  assert.equal(parseHello({ t: "hello" }), null);
});

test("hello binds slots on the socket and transports", async () => {
  const { socket, transports } = await setup();
  socket.receive(hello(2, [{ name: "MST_VNSD_1", address: "aa" }, null, { name: "MST_VNSE_2", address: "bb" }]));
  assert.equal(transports[0].deviceName, "MST_VNSD_1");
  assert.equal(transports[1].deviceName, undefined);
  assert.equal(transports[2].boundDeviceAddress, "bb");
});

test("status and binary frames are routed by slot", async () => {
  const { socket, transports, log } = await setup();
  socket.receive(hello(2, [null, null, null]));
  socket.receive(JSON.stringify({ t: "status", slot: 1, state: "connected", deviceName: "MST_X", address: "cc", rssi: -50, wifiRssi: -60 }));

  assert.deepEqual(log[0].states, []);
  assert.deepEqual(log[1].states, [[ConnectionState.CONNECTED, undefined]]);
  assert.deepEqual(log[1].rssi, [-50]);
  assert.equal(transports[1].deviceName, "MST_X");
  assert.equal(transports[1].isConnected, true);
  assert.equal(transports[0].isConnected, false);

  socket.receive(new Uint8Array([2, 5, 6]).buffer);
  assert.deepEqual(log[2].notes, [[5, 6]]);
  assert.deepEqual(log[1].notes, []);

  socket.receive(JSON.stringify({ t: "status", slot: 1, state: "disconnected" }));
  assert.deepEqual(log[1].states.at(-1), ["disc"]);
});

test("slot-less status is ignored, slotted error reaches only its slot", async () => {
  const { socket, log } = await setup();
  socket.receive(JSON.stringify({ t: "status", state: "connected" }));
  socket.receive(JSON.stringify({ t: "error", slot: 2, code: "x", msg: "boom" }));
  assert.deepEqual(log[0].states, []);
  assert.deepEqual(log[2].states, [[ConnectionState.ERROR, "boom"]]);
});

test("transport sends slot-addressed control and binary frames", async () => {
  const { fake, transports } = await setup();
  await transports[2].scanAndConnect();
  transports[2].disconnect();
  await transports[1].send(new Uint8Array([4]), true);
  assert.deepEqual(JSON.parse(fake.sent[0]), { t: "connect", slot: 2 });
  assert.deepEqual(JSON.parse(fake.sent[1]), { t: "disconnect", slot: 2 });
  assert.deepEqual([...fake.sent[2]], [1, 1, 4]);
  assert.equal(fake.closed, false);
});

test("a bridge older than protocol 2 is rejected", async () => {
  assert.equal(isSupportedVersion(1), false);
  assert.equal(isSupportedVersion(2), true);

  const { fake, socket, transports, log } = await setup();
  const errors = [];
  socket.onError((m) => errors.push(m));
  socket.receive(JSON.stringify({ t: "hello", version: 1, bound: null }));

  assert.equal(fake.closed, true);
  assert.equal(errors.length, 1);
  assert.equal(log[0].states[0][0], ConnectionState.ERROR);
  assert.equal(transports[0].deviceName, undefined);
  await assert.rejects(socket.open());
});

test("manager reports when a firmware transfer session starts and ends", async () => {
  const { BLEConnectionManager } = await import("../src/lib/BLEConnectionManager.ts");
  const transport = {
    kind: "bridge",
    isConnected: true,
    deviceName: "MST_VNSE3_TEST",
    setCallbacks() {},
    send: async () => {},
    scanAndConnect: async () => {},
    reconnect: async () => {},
    disconnect() {},
  };
  const manager = new BLEConnectionManager(transport);
  const seen = [];
  manager.onOtaChange = (running) => seen.push(running);

  assert.equal(manager.isOtaRunning, false);
  const session = await manager.beginOtaSession();
  assert.equal(manager.isOtaRunning, true);
  session.release(false);
  manager.disconnect();
  assert.equal(manager.isOtaRunning, false);
  assert.deepEqual(seen, [true, false]);
});

test("settings responses are parsed, keepConnected is optional", async () => {
  const { parseSettings, isValidHoldSeconds } = await import("../src/lib/bridge/BridgeSettings.ts");
  assert.deepEqual(parseSettings({ holdSeconds: 15, keepConnected: [true, false, 1] }), {
    holdSeconds: 15,
    keepConnected: [true, false, false],
  });
  assert.deepEqual(parseSettings({ holdSeconds: 30 }), { holdSeconds: 30, keepConnected: [] });
  assert.equal(parseSettings({ keepConnected: [] }), null);
  assert.equal(parseSettings(null), null);
  assert.equal(isValidHoldSeconds(4), false);
  assert.equal(isValidHoldSeconds(3600), true);
});

test("keep-connected and hold-time requests have the documented bodies", async () => {
  const { holdBody, keepBody } = await import("../src/lib/bridge/BridgeSettings.ts");
  assert.deepEqual(keepBody(0, true), { keep: { slot: 0, enabled: true } });
  assert.deepEqual(holdBody(20), { holdSeconds: 20 });
});

test("pickRelease skips drafts and takes prereleases only when allowed", async () => {
  const { pickRelease, toBridgeRelease } = await import("../src/lib/bridge/BridgeReleases.ts");
  const list = [
    { tag_name: "v2.0.0-draft", draft: true },
    { tag_name: "v1.5.0-beta.1", prerelease: true },
    { tag_name: "v1.4.0" },
  ];
  assert.equal(pickRelease(list, true).tag_name, "v1.5.0-beta.1");
  assert.equal(pickRelease(list, false).tag_name, "v1.4.0");
  assert.equal(pickRelease([{ tag_name: "x", draft: true }], true), null);
  assert.equal(toBridgeRelease(list[1]).prerelease, true);
  assert.equal(toBridgeRelease(list[2]).prerelease, false);
});

test("releaseDirection detects crossing between beta and stable", async () => {
  const { releaseDirection } = await import("../src/lib/bridge/BridgeReleases.ts");
  assert.equal(releaseDirection("v1.4.0-beta.2", { prerelease: false }), "toStable");
  assert.equal(releaseDirection("v1.4.0", { prerelease: true }), "toBeta");
  assert.equal(releaseDirection("v1.4.0-beta.2", { prerelease: true }), null);
  assert.equal(releaseDirection("v1.4.0", { prerelease: false }), null);
  assert.equal(releaseDirection(undefined, { prerelease: true }), null);
  assert.equal(releaseDirection("v1.4.0", null), null);
});

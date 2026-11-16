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

test("pickRelease takes the most recently published release, not the first in the list", async () => {
  const { pickRelease } = await import("../src/lib/bridge/BridgeReleases.ts");
  // GitHub's list order for tags beta.1 ... beta.10: by name as text, so beta.10 is far down.
  const list = [
    { tag_name: "v1.4.0-beta.9", prerelease: true, published_at: "2026-11-15T20:27:34Z" },
    { tag_name: "v1.4.0-beta.2", prerelease: true, published_at: "2026-11-15T18:56:58Z" },
    { tag_name: "v1.4.0-beta.10", prerelease: true, published_at: "2026-11-15T20:40:50Z" },
    { tag_name: "v1.4.0-beta.1", prerelease: true, published_at: "2026-11-15T18:32:45Z" },
    { tag_name: "v1.3.19", published_at: "2026-11-15T16:26:27Z" },
    { tag_name: "v1.5.0-beta.1", draft: true, prerelease: true, published_at: "2026-11-16T10:00:00Z" },
  ];
  assert.equal(pickRelease(list, true).tag_name, "v1.4.0-beta.10");
  assert.equal(pickRelease(list, false).tag_name, "v1.3.19");
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


test("ordinary commands wait for the storage's answer before the next one is sent", async () => {
  const { BLEConnectionManager } = await import("../src/lib/BLEConnectionManager.ts");
  const sent = [];
  let callbacks = null;
  const transport = {
    kind: "bridge",
    isConnected: true,
    deviceName: "MST_VNSD_TEST",
    setCallbacks(cb) { callbacks = cb; },
    send: async (bytes) => { sent.push(bytes[3]); },
    scanAndConnect: async () => {},
    reconnect: async () => {},
    disconnect() {},
  };
  const manager = new BLEConnectionManager(transport);
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const first = manager.sendPacket(0x03);
  const second = manager.sendPacket(0x42, new Uint8Array([1]));
  await first;
  await wait(150);
  assert.deepEqual(sent, [0x03], "the second command must not go out while the first is unanswered");

  callbacks.onNotify(new Uint8Array([0x73, 0x05, 0x23, 0x03, 0x56]));
  await second;
  await wait(50);
  assert.deepEqual(sent, [0x03, 0x42], "it goes out once the answer has arrived");
  manager.disconnect();
});

test("sortReleases lists the newest first and drops drafts; the firmware image follows the chip", async () => {
  const { sortReleases, toBridgeRelease } = await import("../src/lib/bridge/BridgeReleases.ts");
  const list = [
    { tag_name: "v1.4.0-beta.9", published_at: "2026-11-15T10:00:00Z", prerelease: true },
    { tag_name: "v1.3.21", published_at: "2026-11-16T10:00:00Z" },
    { tag_name: "v1.4.0-beta.10", published_at: "2026-11-15T12:00:00Z", prerelease: true },
    { tag_name: "v1.9.9", published_at: "2026-11-17T10:00:00Z", draft: true },
  ];
  assert.deepEqual(sortReleases(list).map(r => r.tag_name), ["v1.3.21", "v1.4.0-beta.10", "v1.4.0-beta.9"]);

  const assets = [
    { name: "marstek-ble-bridge.bin", browser_download_url: "u/esp32" },
    { name: "marstek-ble-bridge-esp32s3.bin", browser_download_url: "u/s3" },
    { name: "web.bin", browser_download_url: "u/web" },
  ];
  assert.equal(toBridgeRelease({ tag_name: "v1", assets }).firmwareUrl, "u/esp32");
  assert.equal(toBridgeRelease({ tag_name: "v1", assets }, "esp32").firmwareUrl, "u/esp32");
  assert.equal(toBridgeRelease({ tag_name: "v1", assets }, "esp32s3").firmwareUrl, "u/s3");
  assert.equal(toBridgeRelease({ tag_name: "v1", assets: assets.slice(0, 1) }, "esp32s3").firmwareUrl, undefined);
});

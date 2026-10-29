import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFirmwareForOta } from "../src/lib/ota/OtaManager.ts";
import * as codec from "../src/lib/ota/OtaFrameCodec.ts";
import { BLEConnectionManager } from "../src/lib/BLEConnectionManager.ts";
const original = {
  setTimeout,
  clearTimeout,
  log: console.log,
  warn: console.warn,
  error: console.error,
};
class Clock {
  now = 0;
  next = 1;
  events = new Map();
  set = (fn, delay = 0, ...args) => {
    const id = this.next++;
    this.events.set(id, {
      at: this.now + Number(delay),
      fn: () => fn(...args),
    });
    return id;
  };
  clear = (id) => this.events.delete(id);
  step() {
    let selected;
    for (const [id, event] of this.events)
      if (
        !selected ||
        event.at < selected.event.at ||
        (event.at === selected.event.at && id < selected.id)
      )
        selected = { id, event };
    if (!selected) return false;
    this.now = selected.event.at;
    this.events.delete(selected.id);
    selected.event.fn();
    return true;
  }
  // The real semaphore schedules with nextTick. Drain microtasks and that queue
  // before advancing virtual time, or a timer could overtake a completed write.
  async drive(promise) {
    let settled = false,
      result,
      error;
    promise.then(
      (v) => {
        settled = true;
        result = v;
      },
      (e) => {
        settled = true;
        error = e;
      },
    );
    for (let i = 0; i < 15000 && !settled; i++) {
      for (let j = 0; j < 20; j++) await Promise.resolve();
      await new Promise(setImmediate);
      for (let j = 0; j < 20; j++) await Promise.resolve();
      if (!settled && !this.step())
        throw Error("No pending timer while promise unsettled");
    }
    if (!settled) throw Error("Timer step cap");
    if (error) throw error;
    return result;
  }
}
function makeManager(clock, scenario = {}) {
  let callbacks;
  let writes = [];
  let suspends = 0;
  let resumes = 0;
  const notify = (bytes) => callbacks.onNotify(bytes);
  const transport = {
    kind: "web-bluetooth",
    isConnected: true,
    deviceName: "MST_VNSE3_TEST",
    setCallbacks: (c) => {
      callbacks = c;
    },
    send: async (bytes, withResponse) => {
      writes.push({ bytes: new Uint8Array(bytes), withResponse });
      if (scenario.onSend)
        await scenario.onSend(bytes, withResponse, {
          manager,
          notify,
          transport,
          callbacks,
          writes,
          clock,
        });
      const dec = codec.decodeIncomingFrame(bytes);
      if (!dec) return;
      if (dec.cmd === 0x54) return;
      let cmd = dec.cmd === 0x10 ? 0x00 : dec.cmd;
      let payload =
        cmd === 0x00
          ? new Uint8Array([1])
          : cmd === 0x52
            ? new Uint8Array([0, 1])
            : cmd === 0x3a
              ? new Uint8Array([0, 0, 0, 0, 0, 1, 0xaa])
              : cmd === 0x50
                ? new Uint8Array([0, ...dec.payload.subarray(1)])
                : cmd === 0x51
                  ? new Uint8Array([0, ...dec.payload.subarray(1, 5)])
                  : dec.payload;
      if (scenario.payload && cmd === scenario.cmd) payload = scenario.payload;
      if (scenario.throwWrite && cmd === scenario.cmd)
        throw Error("simulated write rejection");
      if (scenario.drop && cmd === scenario.cmd) return;
      if (
        scenario.dropFirst &&
        cmd === scenario.cmd &&
        writes.filter((w) => codec.decodeIncomingFrame(w.bytes)?.cmd === cmd)
          .length === 1
      )
        return;
      const ack =
        cmd === 0x00
          ? codec.buildOtaFrame(0x23, new Uint8Array([0, 1, 0xaa]))
          : codec.buildOtaFrame(cmd, payload);
      if (scenario.badChecksum && cmd === scenario.cmd)
        ack[ack.length - 1] ^= 1;
      const deliver = () => {
        if (scenario.prefix && cmd === scenario.cmd) notify(scenario.prefix);
        if (scenario.corruptThenValid && cmd === scenario.cmd) {
          const bad = new Uint8Array(ack);
          bad[bad.length - 1] ^= 1;
          notify(bad);
        }
        if (scenario.abortBeforeAck && cmd === scenario.cmd)
          scenario.abortBeforeAck();
        if (scenario.unrelated && cmd === scenario.cmd)
          notify(codec.buildOtaFrame(0x03, new Uint8Array([0])));
        if (scenario.split && cmd === scenario.cmd) {
          notify(ack.subarray(0, 3));
          clock.set(() => notify(ack.subarray(3)), 1);
        } else if (scenario.concat && cmd === scenario.cmd)
          notify(new Uint8Array([...ack, ...ack]));
        else notify(ack);
      };
      if (scenario.earlyAll || (scenario.early && cmd === scenario.cmd))
        deliver();
      else clock.set(deliver, scenario.delay ?? 10);
    },
  };
  const manager = new BLEConnectionManager(transport);
  const oldSuspend = manager.suspendPolling.bind(manager);
  manager.suspendPolling = () => {
    suspends++;
    oldSuspend();
  };
  // Keep real lifecycle/polling behavior; record calls without replacing implementation.
  const oldResume = manager.resumePolling.bind(manager);
  manager.resumePolling = () => {
    resumes++;
    oldResume();
  };
  return {
    manager,
    writes,
    notify,
    transport,
    get callbacks() {
      return callbacks;
    },
    get suspends() {
      return suspends;
    },
    get resumes() {
      return resumes;
    },
  };
}
async function check(name, expectation, fn) {
  await test(name, async () => {
    const clock = new Clock();
    globalThis.setTimeout = clock.set;
    globalThis.clearTimeout = clock.clear;
    console.log = console.warn = console.error = () => {};
    try {
      const result = await fn(clock);
      assert.equal(
        result.passesValidation,
        true,
        `${expectation}\n${JSON.stringify(result, null, 2)}`,
      );
    } finally {
      // Settle queued promise/nextTick work while timers still belong to this case.
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await new Promise(setImmediate);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      clock.events.clear();
      globalThis.setTimeout = original.setTimeout;
      globalThis.clearTimeout = original.clearTimeout;
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    }
  });
}
// Generated protocol fixtures, deliberately not executable firmware. The uploader's
// model/type checks use the model signature and component trailer; no vendor bytes
// or hardware access are needed for these deterministic transport regressions.
function fixture(size, trailer) {
  const image = Uint8Array.from(
    { length: size },
    (_, i) => (i * 17 + 11) & 0xff,
  );
  image.set(new TextEncoder().encode("VNSE"), 32);
  image.fill(trailer, size - 2);
  return image;
}
const bytes = fixture(4096, 0x33);
const controlImage = () => fixture(8192, 0xff);
const analysis = analyzeFirmwareForOta("synthetic-vnse-bms.bin", bytes);
const noop = () => {};
const commandWrites = (m, cmd) =>
  m.writes.filter((w) => codec.decodeIncomingFrame(w.bytes)?.cmd === cmd);
async function outcome(clock, promise) {
  try {
    await clock.drive(promise);
    return { accepted: true };
  } catch (e) {
    if (e.message.includes("pending timer") || e.message.includes("step cap"))
      throw e;
    return { accepted: false, error: e.message };
  }
}
async function call(clock, ota, method, args) {
  try {
    await clock.drive(ota[method](...args));
    return { accepted: true };
  } catch (e) {
    if (e.message.includes("pending timer") || e.message.includes("step cap"))
      throw e;
    return { accepted: false, error: e.message };
  }
}

export {
  check,
  makeManager,
  bytes,
  analysis,
  controlImage,
  noop,
  commandWrites,
  outcome,
  call,
};

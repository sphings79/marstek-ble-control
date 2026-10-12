import assert from "node:assert/strict";
import {
  OtaManager,
  analyzeFirmwareForOta,
} from "../src/lib/ota/OtaManager.ts";
import { BLEConnectionManager } from "../src/lib/BLEConnectionManager.ts";
import * as codec from "../src/lib/ota/OtaFrameCodec.ts";
import {
  check,
  makeManager,
  bytes,
  analysis,
  controlImage,
  noop,
  commandWrites,
  outcome,
} from "./ota-test-helpers.mjs";
await check(
  "poll_suspension_inflight_poll_race",
  "Suspending polling must prevent an already-running poll from rearming its timer",
  async (clock) => {
    let release;
    const transport = {
      kind: "web-bluetooth",
      isConnected: true,
      setCallbacks: noop,
      send: () => new Promise((r) => (release = r)),
    };
    const manager = new BLEConnectionManager(transport);
    const poll = manager.doPoll();
    manager.suspendPolling();
    assert.equal(typeof release, "function");
    release();
    await clock.drive(poll);
    return {
      passesValidation: manager.pollTimer === null,
      timerRearmed: manager.pollTimer !== null,
    };
  },
);

await check(
  "run_analysis_bytes_mismatch",
  "Uploader must reject analysis whose size/checksum do not correspond to its bytes",
  async (clock) => {
    const m = makeManager(clock),
      ota = new OtaManager(m.manager);
    const tiny = bytes.subarray(0, 1),
      progress = [];
    let r;
    try {
      await clock.drive(ota.run(tiny, analysis, noop, (p) => progress.push(p)));
      r = { accepted: true };
    } catch (e) {
      r = { accepted: false, error: e.message };
    }
    return {
      passesValidation: !r.accepted,
      ...r,
      actualBytes: tiny.length,
      declaredSize: analysis.size,
      finalPhase: progress.at(-1)?.phase,
    };
  },
);

for (const [name, patch] of [
  ["size", (a) => a.size++],
  ["checksum", (a) => (a.checksum ^= 1)],
  ["model", (a) => (a.modelGuess.model = "Venus D")],
  ["component", (a) => (a.componentGuess.otaTypeFlag = 0)],
])
  await check(
    `run_rejects_mismatched_${name}`,
    "Caller-supplied identity must match independently analyzed bytes",
    async (clock) => {
      const a = structuredClone(analysis);
      patch(a);
      const m = makeManager(clock),
        ota = new OtaManager(m.manager);
      const r = await outcome(clock, ota.run(bytes, a, noop, noop));
      return {
        ...r,
        passesValidation: !r.accepted && m.writes.length === 0,
        writeCount: m.writes.length,
      };
    },
  );

await check(
  "run_unknown_firmware_rejected",
  "Unknown binary identity must be rejected before any write",
  async (clock) => {
    const image = new Uint8Array(128),
      a = analyzeFirmwareForOta("unknown.bin", image),
      m = makeManager(clock),
      ota = new OtaManager(m.manager);
    const r = await outcome(clock, ota.run(image, a, noop, noop));
    return {
      ...r,
      passesValidation: !r.accepted && m.writes.length === 0,
      writeCount: m.writes.length,
    };
  },
);

await check(
  "run_model_mismatch_rejected",
  "Firmware model mismatch with connected advertised model must reject before writes",
  async (clock) => {
    const m = makeManager(clock);
    m.transport.deviceName = "MST_VNSD_TEST";
    const ota = new OtaManager(m.manager),
      r = await outcome(clock, ota.run(bytes, analysis, noop, noop));
    return {
      ...r,
      passesValidation: !r.accepted && m.writes.length === 0,
      writeCount: m.writes.length,
    };
  },
);

await check(
  "run_non_chunk_aligned_rejected",
  "Incomplete firmware image must reject before writes",
  async (clock) => {
    const image = bytes.subarray(0, bytes.length - 1),
      a = analyzeFirmwareForOta(analysis.fileName, image),
      m = makeManager(clock),
      ota = new OtaManager(m.manager);
    const r = await outcome(clock, ota.run(image, a, noop, noop));
    return {
      ...r,
      passesValidation: !r.accepted && m.writes.length === 0,
      writeCount: m.writes.length,
    };
  },
);

await check(
  "run_snapshots_image_and_metadata",
  "Post-start caller mutation must not change transmitted bytes or selected component",
  async (clock) => {
    const image = new Uint8Array(bytes),
      a = structuredClone(analysis),
      expected = new Uint8Array(image),
      m = makeManager(clock),
      ota = new OtaManager(m.manager);
    const run = ota.run(image, a, noop, noop);
    image.fill(0);
    a.size = 1;
    a.checksum = 0;
    a.modelGuess.model = "Venus D";
    a.componentGuess.otaTypeFlag = 0;
    const r = await outcome(clock, run);
    const frames = commandWrites(m, 0x51).map((w) =>
      codec.decodeIncomingFrame(w.bytes),
    );
    const received = new Uint8Array(
      frames.flatMap((f) => Array.from(f.payload.subarray(5))),
    ).subarray(0, expected.length);
    const discovery = codec.decodeIncomingFrame(
      commandWrites(m, 0x3a)[0]?.bytes ?? new Uint8Array(),
    );
    return {
      ...r,
      passesValidation:
        r.accepted &&
        Buffer.compare(expected, received) === 0 &&
        discovery?.payload[3] === analysis.componentGuess.otaTypeFlag,
      identicalSnapshot: Buffer.compare(expected, received) === 0,
      typeFlag: discovery?.payload[3],
    };
  },
);

await check(
  "failure_releases_exclusive_session",
  "Rejected ACK must release ownership, clear its waiter and retain reconnect gate",
  async (clock) => {
    const m = makeManager(clock, { payload: new Uint8Array([0]), cmd: 0x50 }),
      ota = new OtaManager(m.manager),
      progress = [];
    const r = await outcome(
      clock,
      ota.run(bytes, analysis, noop, (p) => progress.push(p)),
    );
    const count = m.writes.length;
    m.notify(codec.buildOtaFrame(0x50, new Uint8Array([0])));
    const available = m.manager.otaToken === null;
    return {
      ...r,
      passesValidation:
        !r.accepted &&
        progress.at(-1)?.phase === "FAILED" &&
        available &&
        m.writes.length === count &&
        m.manager.frameListeners.size === 0 &&
        m.manager.lossListeners.size === 0,
      ownershipReleased: available,
      remainingFrameListeners: m.manager.frameListeners.size,
      remainingLossListeners: m.manager.lossListeners.size,
      remainingTimers: clock.events.size,
    };
  },
);

await check(
  "write_rejection_cleans_session",
  "Rejected transport write must fail and release ownership",
  async (clock) => {
    const m = makeManager(clock, { throwWrite: true, cmd: 0x50 }),
      ota = new OtaManager(m.manager),
      r = await outcome(clock, ota.run(bytes, analysis, noop, noop));
    const available = m.manager.otaToken === null;
    return {
      ...r,
      passesValidation:
        !r.accepted && available && commandWrites(m, 0x51).length === 0,
      ownershipReleased: available,
    };
  },
);

await check(
  "abort_before_start",
  "Already-aborted signal must cause zero writes and leave session available",
  async (clock) => {
    const ac = new AbortController();
    ac.abort();
    const m = makeManager(clock),
      ota = new OtaManager(m.manager),
      r = await outcome(clock, ota.run(bytes, analysis, noop, noop, ac.signal));
    const available = m.manager.otaToken === null;
    return {
      ...r,
      passesValidation:
        !r.accepted &&
        m.writes.length === 0 &&
        available &&
        !m.manager.requiresReconnect,
      writeCount: m.writes.length,
      ownershipReleased: available,
    };
  },
);

await check(
  "abort_waiting_for_ack",
  "Cancellation while waiting for size ACK must stop promptly without data/finalize",
  async (clock) => {
    const ac = new AbortController();
    const m = makeManager(clock, {
        drop: true,
        cmd: 0x50,
        onSend: async (raw, response, ctx) => {
          if (codec.decodeIncomingFrame(raw)?.cmd === 0x50)
            ctx.clock.set(() => ac.abort(), 1);
        },
      }),
      ota = new OtaManager(m.manager);
    const started = clock.now,
      r = await outcome(clock, ota.run(bytes, analysis, noop, noop, ac.signal)),
      available = m.manager.otaToken === null;
    return {
      ...r,
      passesValidation:
        !r.accepted &&
        available &&
        commandWrites(m, 0x51).length === 0 &&
        clock.now - started < 5000,
      elapsedVirtualMs: clock.now - started,
      ownershipReleased: available,
    };
  },
);

await check(
  "cancel_method_waiting",
  "Public cancel must terminate current exchange and release ownership",
  async (clock) => {
    let ota;
    const m = makeManager(clock, {
      drop: true,
      cmd: 0x50,
      onSend: async (raw, response, ctx) => {
        if (codec.decodeIncomingFrame(raw)?.cmd === 0x50)
          ctx.clock.set(() => ota.cancel(), 1);
      },
    });
    ota = new OtaManager(m.manager);
    const r = await outcome(clock, ota.run(bytes, analysis, noop, noop)),
      available = m.manager.otaToken === null;
    return {
      ...r,
      passesValidation:
        !r.accepted && available && commandWrites(m, 0x51).length === 0,
      ownershipReleased: available,
    };
  },
);

await check(
  "disconnect_waiting_for_ack",
  "Connection loss must immediately reject waiting exchange without retries",
  async (clock) => {
    const m = makeManager(clock, {
        drop: true,
        cmd: 0x50,
        onSend: async (raw, response, ctx) => {
          if (codec.decodeIncomingFrame(raw)?.cmd === 0x50)
            ctx.clock.set(() => {
              ctx.transport.isConnected = false;
              ctx.callbacks.onDisconnected();
            }, 1);
        },
      }),
      ota = new OtaManager(m.manager),
      r = await outcome(clock, ota.run(bytes, analysis, noop, noop));
    return {
      ...r,
      passesValidation:
        !r.accepted &&
        /disconnect|connection/i.test(r.error) &&
        commandWrites(m, 0x51).length === 0 &&
        clock.now < 5000,
      elapsedVirtualMs: clock.now,
    };
  },
);

for (const same of [true, false])
  await check(
    `overlap_${same ? "same" : "different"}_ota_manager`,
    "Concurrent run on same connection must fail without disturbing original run",
    async (clock) => {
      const m = makeManager(clock),
        ota = new OtaManager(m.manager),
        other = same ? ota : new OtaManager(m.manager);
      const first = ota.run(bytes, analysis, noop, noop);
      const second = other.run(bytes, analysis, noop, noop);
      const rejected = second.then(
        () => ({ accepted: true }),
        (e) => ({ accepted: false, error: e.message }),
      );
      const [r1, r2] = await clock.drive(
        Promise.all([
          first.then(
            () => ({ accepted: true }),
            (e) => ({ accepted: false, error: e.message }),
          ),
          rejected,
        ]),
      );
      return {
        passesValidation:
          r1.accepted && !r2.accepted && commandWrites(m, 0x54).length === 1,
        first: r1,
        second: r2,
        activationCount: commandWrites(m, 0x54).length,
      };
    },
  );

await check(
  "dashboard_commands_blocked_during_ota",
  "Dashboard and ordinary raw sends must be rejected while OTA owns the connection",
  async (clock) => {
    let attempted = false,
      blocked = [],
      blockedPromise;
    const m = makeManager(clock, {
        onSend: async (raw, response, ctx) => {
          if (codec.decodeIncomingFrame(raw)?.cmd === 0x50 && !attempted) {
            attempted = true;
            blockedPromise = Promise.all(
              [
                ctx.manager.sendPacket(0x03),
                ctx.manager.sendRaw(
                  codec.buildOtaFrame(0x03, new Uint8Array([0])),
                ),
              ].map((p) =>
                p.then(
                  () => false,
                  () => true,
                ),
              ),
            );
            ctx.manager.pollState();
          }
        },
      }),
      ota = new OtaManager(m.manager),
      r = await outcome(clock, ota.run(bytes, analysis, noop, noop));
    if (blockedPromise) blocked = await clock.drive(blockedPromise);
    return {
      ...r,
      passesValidation:
        r.accepted &&
        blocked.length === 2 &&
        blocked.every(Boolean) &&
        commandWrites(m, 0x03).length === 0,
      blocked,
      unrelatedWriteCount: commandWrites(m, 0x03).length,
    };
  },
);

for (const kind of ["abort", "disconnect"])
  await check(
    `${kind}_during_unsettled_write`,
    "Connection loss or cancellation must reject promptly even while write completion is pending",
    async (clock) => {
      const ac = new AbortController();
      const m = makeManager(clock, {
          onSend: async (raw, response, ctx) => {
            if (codec.decodeIncomingFrame(raw)?.cmd === 0x50) {
              ctx.clock.set(() => {
                if (kind === "abort") ac.abort();
                else {
                  ctx.transport.isConnected = false;
                  ctx.callbacks.onDisconnected();
                }
              }, 1);
              await new Promise((resolve) => ctx.clock.set(resolve, 10000));
            }
          },
        }),
        ota = new OtaManager(m.manager),
        r = await outcome(
          clock,
          ota.run(bytes, analysis, noop, noop, ac.signal),
        );
      const elapsed = clock.now;
      return {
        ...r,
        passesValidation:
          !r.accepted && elapsed < 5000 && commandWrites(m, 0x51).length === 0,
        elapsedVirtualMs: elapsed,
      };
    },
  );

await check(
  "session_reserves_before_draining_prior_write",
  "Reserving OTA must block later dashboard writes while draining an already-started write",
  async (clock) => {
    let release;
    const writes = [];
    const transport = {
      kind: "web-bluetooth",
      isConnected: true,
      setCallbacks: noop,
      send: async (bytes) => {
        writes.push(new Uint8Array(bytes));
        await new Promise((r) => (release = r));
      },
    };
    const manager = new BLEConnectionManager(transport);
    const existing = manager.sendPacket(0x03);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const reservation = manager.beginOtaSession();
    const blocked = await manager.sendPacket(0x04).then(
      () => false,
      () => true,
    );
    clock.set(() => release(), 1);
    const session = await clock.drive(reservation);
    await existing;
    session.release(false);
    return {
      passesValidation: blocked && writes.length === 1,
      blocked,
      writeCount: writes.length,
    };
  },
);

for (const kind of ["abort", "disconnect"])
  await check(
    `${kind}_during_initial_gate_write`,
    "Initial gate write must observe cancellation and loss before its promise settles",
    async (clock) => {
      const ac = new AbortController();
      const m = makeManager(clock, {
          onSend: async (raw, response, ctx) => {
            if (codec.decodeIncomingFrame(raw)?.cmd === 0x54) {
              ctx.clock.set(() => {
                if (kind === "abort") ac.abort();
                else {
                  ctx.transport.isConnected = false;
                  ctx.callbacks.onDisconnected();
                }
              }, 1);
              await new Promise((r) => ctx.clock.set(r, 10000));
            }
          },
        }),
        ota = new OtaManager(m.manager),
        r = await outcome(
          clock,
          ota.run(bytes, analysis, noop, noop, ac.signal),
        );
      return {
        ...r,
        passesValidation:
          !r.accepted &&
          clock.now < 1000 &&
          commandWrites(m, 0x10).length === 0 &&
          m.manager.frameListeners.size === 0 &&
          m.manager.lossListeners.size === 0,
        elapsedVirtualMs: clock.now,
      };
    },
  );

for (const kind of ["abort", "disconnect"])
  await check(
    `${kind}_during_activation_pause`,
    "Post-activation settling pause must observe cancellation/loss and stop before discovery",
    async (clock) => {
      const ac = new AbortController();
      const m = makeManager(clock),
        ota = new OtaManager(m.manager);
      const r = await outcome(
        clock,
        ota.run(
          bytes,
          analysis,
          noop,
          (p) => {
            if (p.phase === "ACTIVATING")
              clock.set(() => {
                if (kind === "abort") ac.abort();
                else {
                  m.transport.isConnected = false;
                  m.callbacks.onDisconnected();
                }
              }, 300);
          },
          ac.signal,
        ),
      );
      return {
        ...r,
        passesValidation:
          !r.accepted &&
          clock.now < 1000 &&
          commandWrites(m, 0x3a).length === 0 &&
          m.manager.frameListeners.size === 0 &&
          m.manager.lossListeners.size === 0,
        elapsedVirtualMs: clock.now,
      };
    },
  );

await check(
  "initial_gate_write_timeout",
  "Unsettled startup write must fail within the bounded activation budget",
  async (clock) => {
    const m = makeManager(clock, {
        onSend: async (raw, response, ctx) => {
          if (codec.decodeIncomingFrame(raw)?.cmd === 0x54)
            await new Promise((r) => ctx.clock.set(r, 10000));
        },
      }),
      ota = new OtaManager(m.manager),
      r = await outcome(clock, ota.run(bytes, analysis, noop, noop));
    return {
      ...r,
      passesValidation:
        !r.accepted &&
        /timeout/i.test(r.error) &&
        clock.now === 3000 &&
        commandWrites(m, 0x10).length === 0 &&
        m.manager.lossListeners.size === 0,
      elapsedVirtualMs: clock.now,
    };
  },
);

await check(
  "session_drain_timeout",
  "Prior write must not hold startup forever; bounded drain rejects and removes listeners",
  async (clock) => {
    const transport = {
        kind: "web-bluetooth",
        isConnected: true,
        setCallbacks: noop,
        send: () => new Promise(noop),
      },
      manager = new BLEConnectionManager(transport);
    const pending = manager.sendPacket(0x03);
    pending.catch(noop);
    const r = await outcome(clock, manager.beginOtaSession());
    return {
      ...r,
      passesValidation:
        !r.accepted &&
        /draining/i.test(r.error) &&
        manager.requiresReconnect &&
        clock.now === 5000 &&
        manager.otaToken === null &&
        manager.lossListeners.size === 0,
      elapsedVirtualMs: clock.now,
    };
  },
);

for (const failed of [false, true])
  await check(
    `post_${failed ? "failure" : "success"}_reconnect_gate`,
    "After activation, every command/retry path must stay blocked until a fresh connection",
    async (clock) => {
      const m = makeManager(
          clock,
          failed ? { payload: new Uint8Array([0]), cmd: 0x50 } : {},
        ),
        ota = new OtaManager(m.manager);
      const first = await outcome(clock, ota.run(bytes, analysis, noop, noop));
      const count = m.writes.length;
      const blocked = {};
      for (const [name, fn] of [
        ["normal", () => m.manager.sendPacket(0x03)],
        [
          "raw",
          () =>
            m.manager.sendRaw(codec.buildOtaFrame(0x03, new Uint8Array([0]))),
        ],
        ["session", () => m.manager.beginOtaSession()],
        ["sameUploader", () => ota.run(bytes, analysis, noop, noop)],
        [
          "newUploader",
          () => new OtaManager(m.manager).run(bytes, analysis, noop, noop),
        ],
      ])
        blocked[name] = !(await outcome(clock, fn())).accepted;
      m.manager.resumePolling();
      m.manager.pollState();
      await clock.drive(m.manager.doPoll());
      const writesBlocked =
        m.writes.length === count && m.manager.pollTimer === null;
      m.callbacks.onStateChange("CONNECTED");
      await clock.drive(m.manager.doPoll());
      const duplicateConnectedBlocked =
        m.manager.requiresReconnect && m.writes.length === count;
      m.transport.isConnected = false;
      m.callbacks.onStateChange("CONNECTING");
      m.transport.isConnected = true;
      m.callbacks.onStateChange("CONNECTED");
      const cleared = !m.manager.requiresReconnect;
      await clock.drive(m.manager.doPoll());
      const ordinary = await outcome(clock, m.manager.sendPacket(0x03));
      const raw = await outcome(
        clock,
        m.manager.sendRaw(codec.buildOtaFrame(0x03, new Uint8Array([0]))),
      );
      const session = await clock.drive(m.manager.beginOtaSession());
      session.release();
      return {
        passesValidation:
          first.accepted === !failed &&
          Object.values(blocked).every(Boolean) &&
          writesBlocked &&
          duplicateConnectedBlocked &&
          cleared &&
          ordinary.accepted &&
          raw.accepted,
        initial: first,
        blocked,
        writesBlocked,
        duplicateConnectedBlocked,
        freshConnectionCleared: cleared,
        ordinaryAfterReconnect: ordinary.accepted,
        rawAfterReconnect: raw.accepted,
      };
    },
  );

for (const method of ["reconnect", "scanAndConnect"])
  await check(
    `${method}_forces_physical_disconnect`,
    "A gated but still-connected transport must physically disconnect before connecting again",
    async (clock) => {
      const m = makeManager(clock),
        events = [];
      const session = await clock.drive(m.manager.beginOtaSession());
      session.release(false);
      m.transport.disconnect = () => {
        events.push("disconnect");
        m.transport.isConnected = false;
        m.callbacks.onDisconnected();
      };
      m.transport[method] = async () => {
        events.push(method);
        m.callbacks.onStateChange("CONNECTING");
        m.transport.isConnected = true;
        m.callbacks.onStateChange("CONNECTED");
      };
      await clock.drive(m.manager[method]());
      return {
        passesValidation:
          JSON.stringify(events) === JSON.stringify(["disconnect", method]) &&
          !m.manager.requiresReconnect,
        events,
        requiresReconnect: m.manager.requiresReconnect,
      };
    },
  );

for (const bad of ["preaborted", "invalidAnalysis"])
  await check(
    `${bad}_leaves_reconnect_gate_open`,
    "Failure before activation must allow recovery without a reconnect",
    async (clock) => {
      const m = makeManager(clock),
        ota = new OtaManager(m.manager),
        ac = new AbortController(),
        a = structuredClone(analysis);
      if (bad === "preaborted") ac.abort();
      else a.checksum ^= 1;
      const r = await outcome(clock, ota.run(bytes, a, noop, noop, ac.signal));
      const open = !m.manager.requiresReconnect;
      const count = m.writes.length;
      const session = await clock.drive(m.manager.beginOtaSession());
      session.release();
      return {
        ...r,
        passesValidation: !r.accepted && open && count === 0,
        gateOpenBeforeRecovery: open,
        writeCountBeforeRecovery: count,
      };
    },
  );

await check(
  "disconnect_without_connecting_then_connected_clears_gate",
  "A real disconnection followed by CONNECTED is sufficient fresh lifecycle evidence",
  async (clock) => {
    const m = makeManager(clock),
      session = await clock.drive(m.manager.beginOtaSession());
    session.release(false);
    m.transport.isConnected = false;
    m.callbacks.onDisconnected();
    m.transport.isConnected = true;
    m.callbacks.onStateChange("CONNECTED");
    return {
      passesValidation: !m.manager.requiresReconnect,
      requiresReconnect: m.manager.requiresReconnect,
    };
  },
);

for (const component of ["bms", "control"]) {
  await check(
    `${component}_successful_run_cleans_session`,
    "An accepted full transfer must release ownership, remove listeners and keep polling gated until reconnect",
    async (clock) => {
      const image = component === "bms" ? bytes : controlImage();
      const metadata = analyzeFirmwareForOta(
        `synthetic-vnse-${component}.bin`,
        image,
      );
      const m = makeManager(clock),
        ota = new OtaManager(m.manager);
      const r = await outcome(clock, ota.run(image, metadata, noop, noop));
      return {
        ...r,
        passesValidation:
          r.accepted &&
          m.manager.otaToken === null &&
          m.manager.frameListeners.size === 0 &&
          m.manager.lossListeners.size === 0 &&
          m.manager.pollTimer === null &&
          m.manager.requiresReconnect &&
          m.writes.every((w) => !w.withResponse),
      };
    },
  );
}

await check(
  "reconnect_recovers_from_never_settled_write",
  "A fresh connection must recover command writes even when a prior transport write never settles",
  async (clock) => {
    let hung = false;
    const m = makeManager(clock, {
      onSend: async (raw) => {
        if (codec.decodeIncomingFrame(raw)?.cmd === 0x50 && !hung) {
          hung = true;
          await new Promise(() => {});
        }
      },
    });
    const ota = new OtaManager(m.manager);
    const result = await outcome(clock, ota.run(bytes, analysis, noop, noop));
    const gated = m.manager.requiresReconnect;
    m.transport.isConnected = false;
    m.callbacks.onDisconnected();
    m.callbacks.onStateChange("CONNECTING");
    m.transport.isConnected = true;
    m.callbacks.onStateChange("CONNECTED");
    const recovered = m.manager.sendPacket(0x04).then(
      () => true,
      () => false,
    );
    const bounded = Promise.race([
      recovered,
      new Promise((resolve) => clock.set(() => resolve(false), 1000)),
    ]);
    const sent = await clock.drive(bounded);
    return {
      passesValidation:
        !result.accepted && gated && sent && commandWrites(m, 0x04).length === 1,
      sent,
    };
  },
);

for (const state of ["ERROR", "CONNECTING"])
  await check(
    `${state.toLowerCase()}_while_connected_does_not_clear_reconnect_gate`,
    "A state message without connection turnover must not clear the reconnect requirement",
    async (clock) => {
      const m = makeManager(clock);
      const session = await clock.drive(m.manager.beginOtaSession());
      session.release(false);
      m.callbacks.onStateChange(state);
      m.callbacks.onStateChange("CONNECTED");
      const blocked = await clock.drive(
        m.manager.sendRaw(new Uint8Array([1])).then(
          () => false,
          () => true,
        ),
      );
      return {
        passesValidation: m.manager.requiresReconnect && blocked,
        blocked,
      };
    },
  );

await check(
  "late_old_write_cannot_release_new_connection_mutex",
  "A late completion and queued command from the old connection must not unlock or write through the new queue",
  async (clock) => {
    let releaseOld, releaseNew;
    const m = makeManager(clock, {
      onSend: async (raw) => {
        const cmd = codec.decodeIncomingFrame(raw)?.cmd;
        if (cmd === 0x04)
          await new Promise((resolve) => {
            releaseOld = resolve;
          });
        if (cmd === 0x05)
          await new Promise((resolve) => {
            releaseNew = resolve;
          });
      },
    });
    m.manager.suspendPolling();
    // Raw writes allow deliberate queue control without the dashboard polling guard.
    const old = m.manager.sendRaw(
      codec.buildOtaFrame(0x04, new Uint8Array([0])),
    );
    const oldResult = old.then(
      () => false,
      () => true,
    );
    const stale = m.manager
      .sendRaw(codec.buildOtaFrame(0x06, new Uint8Array([0])))
      .then(
        () => false,
        () => true,
      );
    for (let i = 0; i < 20; i++) await Promise.resolve();
    m.transport.isConnected = false;
    m.callbacks.onDisconnected();
    m.callbacks.onStateChange("CONNECTING");
    m.transport.isConnected = true;
    m.callbacks.onStateChange("CONNECTED");
    m.manager.suspendPolling();
    const current = m.manager.sendRaw(
      codec.buildOtaFrame(0x05, new Uint8Array([0])),
    );
    const next = m.manager.sendRaw(
      codec.buildOtaFrame(0x07, new Uint8Array([0])),
    );
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await clock.drive(new Promise((resolve) => clock.set(resolve, 50)));
    if (typeof releaseNew !== "function")
      return {
        passesValidation: false,
        reason: "Fresh write is blocked by the previous connection",
      };
    releaseOld();
    const oldRejected = await clock.drive(oldResult);
    const staleBlocked = await clock.drive(stale);
    const nextBeforeRelease = commandWrites(m, 0x07).length;
    releaseNew();
    await clock.drive(current);
    await clock.drive(next);
    return {
      passesValidation:
        oldRejected &&
        staleBlocked &&
        commandWrites(m, 0x06).length === 0 &&
        nextBeforeRelease === 0 &&
        commandWrites(m, 0x07).length === 1,
      staleBlocked,
      nextBeforeRelease,
    };
  },
);

await check(
  "old_session_cannot_send_after_connection_turnover",
  "A session reserved on the old connection cannot send on a freshly connected transport",
  async (clock) => {
    const m = makeManager(clock);
    const session = await clock.drive(m.manager.beginOtaSession());
    m.transport.isConnected = false;
    m.callbacks.onDisconnected();
    m.callbacks.onStateChange("CONNECTING");
    m.transport.isConnected = true;
    m.callbacks.onStateChange("CONNECTED");
    const blocked = await clock.drive(
      session.send(codec.buildOtaFrame(0x54, new Uint8Array([0x10]))).then(
        () => false,
        () => true,
      ),
    );
    session.release(false);
    // Fresh evidence was consumed while the old owner unwound; a duplicate is insufficient.
    m.callbacks.onStateChange("CONNECTED");
    return {
      passesValidation:
        blocked && m.writes.length === 0 && m.manager.requiresReconnect,
      blocked,
      gate: m.manager.requiresReconnect,
    };
  },
);

for (const method of ["reconnect", "scanAndConnect"])
  await check(
    `${method}_awaits_async_disconnect_and_coalesces_requests`,
    "Reconnect must wait for the asynchronous disconnect event and coalesce overlapping requests",
    async (clock) => {
      const m = makeManager(clock),
        events = [];
      const session = await clock.drive(m.manager.beginOtaSession());
      session.release(false);
      m.transport.disconnect = () => {
        events.push("disconnect-request");
        // Even if isConnected goes false immediately, the teardown event is delayed.
        m.transport.isConnected = false;
        clock.set(() => {
          events.push("disconnect-event");
          m.callbacks.onDisconnected();
        }, 100);
      };
      for (const key of ["reconnect", "scanAndConnect"])
        m.transport[key] = async () => {
          events.push(key);
          m.callbacks.onStateChange("CONNECTING");
          m.transport.isConnected = true;
          m.callbacks.onStateChange("CONNECTED");
        };
      const first = m.manager[method]();
      await new Promise(setImmediate);
      const second = m.manager.reconnect();
      const coalesced = first === second;
      await clock.drive(first);
      await second;
      return {
        passesValidation:
          coalesced &&
          JSON.stringify(events) ===
            JSON.stringify([
              "disconnect-request",
              "disconnect-event",
              method,
            ]) &&
          !m.manager.requiresReconnect &&
          m.manager.disconnectListeners.size === 0,
        events,
        coalesced,
      };
    },
  );

await check(
  "reconnect_disconnect_timeout_keeps_gate_and_cleans_waiter",
  "Missing disconnect confirmation must not start a new connection or remove the reconnect gate",
  async (clock) => {
    const m = makeManager(clock);
    const session = await clock.drive(m.manager.beginOtaSession());
    session.release(false);
    let connects = 0;
    m.transport.disconnect = noop;
    m.transport.reconnect = async () => {
      connects++;
    };
    const result = await outcome(clock, m.manager.reconnect());
    return {
      ...result,
      passesValidation:
        !result.accepted &&
        /Disconnect timed out/.test(result.error) &&
        connects === 0 &&
        m.manager.requiresReconnect &&
        m.manager.disconnectListeners.size === 0 &&
        m.manager.connectionTask === null &&
        clock.now === 5000,
      connects,
    };
  },
);

await check(
  "turnover_rejects_waiters_behind_never_settled_write",
  "Turnover must promptly reject active and queued old writes even if the transport never settles",
  async (clock) => {
    const m = makeManager(clock, {
      onSend: async () => {
        await new Promise(() => {});
      },
    });
    m.manager.suspendPolling();
    const active = m.manager.sendRaw(new Uint8Array([1])).then(
      () => false,
      () => true,
    );
    const queued = m.manager.sendRaw(new Uint8Array([2])).then(
      () => false,
      () => true,
    );
    await new Promise(setImmediate);
    m.transport.isConnected = false;
    m.callbacks.onDisconnected();
    const results = await clock.drive(Promise.all([active, queued]));
    return {
      passesValidation:
        results.every(Boolean) &&
        m.writes.length === 1 &&
        m.manager.writeRejectors.size === 0,
      results,
    };
  },
);
await check(
  "suspend_polling_preserves_explicit_commands_without_ota_owner",
  "Suspending automatic polling alone must preserve explicit dashboard commands",
  async (clock) => {
    const m = makeManager(clock);
    m.manager.suspendPolling();
    const result = await outcome(clock, m.manager.sendPacket(0x04));
    return {
      ...result,
      passesValidation:
        result.accepted &&
        commandWrites(m, 0x04).length === 1 &&
        m.manager.pollTimer === null,
    };
  },
);

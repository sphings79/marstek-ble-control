import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { WebBluetoothTransport } from "../src/lib/transport/WebBluetoothTransport.ts";
import {
  OtaManager,
  analyzeFirmwareForOta,
} from "../src/lib/ota/OtaManager.ts";
import * as codec from "../src/lib/ota/OtaFrameCodec.ts";
import { VenusPacket } from "../src/lib/VenusPacket.ts";
import {
  check,
  makeManager,
  bytes,
  analysis,
  controlImage,
  noop,
  commandWrites,
  outcome,
  call,
} from "./ota-test-helpers.mjs";
const log = [];
await check(
  "full_delayed_ack_bms",
  "Synthetic BMS image bytes transferred in order under timely complete mock ACKs",
  async (clock) => {
    const m = makeManager(clock),
      ota = new OtaManager(m.manager),
      progress = [];
    await clock.drive(
      ota.run(
        bytes,
        analysis,
        (s) => log.push(s),
        (p) => progress.push(p),
      ),
    );
    const frames = m.writes
      .map((w) => codec.decodeIncomingFrame(w.bytes))
      .filter((x) => x?.cmd === 0x51);
    const transmitted = new Uint8Array(
      frames.flatMap((f) => Array.from(f.payload.subarray(5))),
    ).subarray(0, bytes.length);
    const identical = Buffer.compare(bytes, transmitted) === 0;
    return {
      passesValidation:
        identical &&
        progress.at(-1).phase === "SUCCESS" &&
        m.manager.frameListeners.size === 0,
      chunkCount: frames.length,
      declaredSize: analysis.size,
      checksum: analysis.checksum,
      identicalImageBytes: identical,
      allWritesWithoutResponse: m.writes.every((w) => !w.withResponse),
      suspends: m.suspends,
      resumes: m.resumes,
    };
  },
);

await check(
  "full_delayed_ack_control",
  "Synthetic Control image bytes transferred in order under timely complete mock ACKs",
  async (clock) => {
    const image = controlImage(),
      a = analyzeFirmwareForOta("synthetic-vnse-control.bin", image);
    const m = makeManager(clock),
      ota = new OtaManager(m.manager),
      progress = [];
    await clock.drive(ota.run(image, a, noop, (p) => progress.push(p)));
    const frames = m.writes
      .map((w) => codec.decodeIncomingFrame(w.bytes))
      .filter((x) => x?.cmd === 0x51);
    const transmitted = new Uint8Array(
      frames.flatMap((f) => Array.from(f.payload.subarray(5))),
    ).subarray(0, image.length);
    const identical = Buffer.compare(image, transmitted) === 0;
    return {
      passesValidation:
        identical &&
        progress.at(-1).phase === "SUCCESS" &&
        m.manager.frameListeners.size === 0,
      chunkCount: frames.length,
      declaredSize: a.size,
      checksum: a.checksum,
      imageSha256: createHash("sha256").update(image).digest("hex"),
      component: a.componentGuess.component,
      identicalImageBytes: identical,
      allWritesWithoutResponse: m.writes.every((w) => !w.withResponse),
    };
  },
);

await check(
  "truncated_size_ack_eight_byte_payload",
  "A malformed size ACK missing one byte of the expected DIR+eight-byte echo must reject",
  async (clock) => {
    const m = makeManager(clock, {
        payload: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        cmd: 0x50,
      }),
      ota = new OtaManager(m.manager),
      logs = [];
    const r = await call(clock, ota, "sendSize", [
      bytes.length,
      analysis.checksum,
      (s) => logs.push(s),
    ]);
    return {
      passesValidation: !r.accepted,
      ...r,
      payloadHex: "0102030405060708",
      logs,
    };
  },
);

await check(
  "web_bluetooth_write_bound",
  "Direct transport writes the complete 138-byte OTA frame; a 20-byte-only characteristic rejects without fragmentation",
  async () => {
    const transport = new WebBluetoothTransport();
    transport.device = { gatt: { connected: true } };
    const lengths = [];
    transport.txChar = {
      writeValueWithoutResponse: async (b) => {
        lengths.push(b.length);
        if (b.length > 20) throw Error("simulated ATT value cap20");
      },
    };
    let error;
    try {
      await transport.send(
        codec.buildDataFrame(0, bytes.subarray(0, 128)),
        false,
      );
    } catch (e) {
      error = e.message;
    }
    return {
      passesValidation:
        lengths.length === 1 &&
        lengths[0] === 138 &&
        error === "simulated ATT value cap20",
      writtenLengths: lengths,
      error,
      interpretation:
        "Transport capability limitation; this is not a live MTU measurement.",
    };
  },
);

for (const [method, cmd, args] of [
  ["activate", 0, [noop]],
  ["discover", 0x3a, [3, noop]],
  ["sendSize", 0x50, [bytes.length, analysis.checksum, noop]],
  ["sendChunks", 0x51, [bytes.subarray(0, 128), noop, noop]],
  ["finalize", 0x52, [analysis, noop]],
])
  await check(
    `${method}_early_ack`,
    "An ACK arriving before the write promise resolves must remain available",
    async (clock) => {
      const m = makeManager(clock, { early: true, cmd }),
        ota = new OtaManager(m.manager);
      const r = await call(clock, ota, method, args);
      return {
        passesValidation: r.accepted,
        ...r,
        writeCount: m.writes.length,
      };
    },
  );

for (const [method, cmd, args] of [
  ["sendSize", 0x50, [bytes.length, analysis.checksum, noop]],
  ["sendChunks", 0x51, [bytes.subarray(0, 128), noop, noop]],
])
  await check(
    `${method}_empty_semantics_ack`,
    "Matching command with unvalidated one-byte zero payload must not establish acceptance",
    async (clock) => {
      const m = makeManager(clock, { payload: new Uint8Array([0]), cmd }),
        ota = new OtaManager(m.manager);
      const r = await call(clock, ota, method, args);
      return { passesValidation: !r.accepted, ...r, payloadHex: "00" };
    },
  );

await check(
  "discovery_unvalidated_payload",
  "Discovery must validate acknowledgement payload semantics",
  async (clock) => {
    const m = makeManager(clock, { payload: new Uint8Array([0]), cmd: 0x3a }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "discover", [3, noop]);
    return { passesValidation: !r.accepted, ...r, payloadHex: "00" };
  },
);

await check(
  "discovery_explicit_acceptance_flag_zero",
  "Actual discovery ACK accepted flag0 must reject the selected OTA target",
  async (clock) => {
    const m = makeManager(clock, {
        payload: new Uint8Array([0, 0, 0, 0, 0, 0, 0xaa]),
        cmd: 0x3a,
      }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "discover", [3, noop]);
    return {
      passesValidation: !r.accepted,
      ...r,
      payloadHex: "000000000000aa",
    };
  },
);

await check(
  "chunk_retry_then_valid_ack",
  "A dropped first chunk ACK followed by a valid retry ACK must recover",
  async (clock) => {
    const m = makeManager(clock, { dropFirst: true, cmd: 0x51 }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendChunks", [
      bytes.subarray(0, 128),
      noop,
      noop,
    ]);
    return {
      passesValidation: r.accepted && m.writes.length === 2,
      ...r,
      writeCount: m.writes.length,
    };
  },
);

await check(
  "size_wrong_echoed_checksum",
  "Size checksum echo mismatch must halt transfer",
  async (clock) => {
    const m = makeManager(clock, {
        payload: new Uint8Array([
          0,
          ...codec
            .buildSizeFrame(bytes.length, analysis.checksum)
            .subarray(5, 9),
          1,
          2,
          3,
          4,
        ]),
        cmd: 0x50,
      }),
      ota = new OtaManager(m.manager);
    const logs = [];
    const r = await call(clock, ota, "sendSize", [
      bytes.length,
      analysis.checksum,
      (s) => logs.push(s),
    ]);
    return { passesValidation: !r.accepted, ...r, logs };
  },
);

await check(
  "chunk_wrong_echoed_offset",
  "A chunk acknowledgement must correlate with the current offset",
  async (clock) => {
    const m = makeManager(clock, {
        payload: new Uint8Array([0, 255, 255, 255, 255]),
        cmd: 0x51,
      }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendChunks", [
      bytes.subarray(0, 128),
      noop,
      noop,
    ]);
    return { passesValidation: !r.accepted, ...r, payloadHex: "00ffffffff" };
  },
);

await check(
  "finalize_explicit_rejection",
  "Finalization status 00 02 must reject",
  async (clock) => {
    const m = makeManager(clock, {
        payload: new Uint8Array([0, 2]),
        cmd: 0x52,
      }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "finalize", [analysis, noop]);
    return { passesValidation: !r.accepted, ...r };
  },
);

await check(
  "split_ack_real_connection_manager",
  "A valid OTA ACK split into two notifications must be reassembled for OTA",
  async (clock) => {
    const m = makeManager(clock, { split: true, cmd: 0x50 }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendSize", [
      bytes.length,
      analysis.checksum,
      noop,
    ]);
    return {
      passesValidation: r.accepted,
      ...r,
      rxAssemblyRemaining: m.manager.rxAssembly.length,
    };
  },
);

await check(
  "concatenated_acks",
  "A notification containing multiple complete OTA frames must be parsed",
  async (clock) => {
    const m = makeManager(clock, { concat: true, cmd: 0x50 }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendSize", [
      bytes.length,
      analysis.checksum,
      noop,
    ]);
    return { passesValidation: r.accepted, ...r };
  },
);

await check(
  "unrelated_notification_before_ack",
  "Unrelated valid notification must not consume the expected ACK waiter",
  async (clock) => {
    const m = makeManager(clock, { unrelated: true, cmd: 0x50 }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendSize", [
      bytes.length,
      analysis.checksum,
      noop,
    ]);
    return { passesValidation: r.accepted, ...r };
  },
);

await check(
  "bad_checksum_ack",
  "Corrupt XOR acknowledgement must reject",
  async (clock) => {
    const m = makeManager(clock, { badChecksum: true, cmd: 0x50 }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendSize", [
      bytes.length,
      analysis.checksum,
      noop,
    ]);
    return { passesValidation: !r.accepted, ...r };
  },
);

await check(
  "no_ack_chunk_bounded_retries",
  "Missing ACK must exhaust exactly three direct-link chunk attempts",
  async (clock) => {
    const m = makeManager(clock, { drop: true, cmd: 0x51 }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendChunks", [
      bytes.subarray(0, 128),
      noop,
      noop,
    ]);
    return {
      passesValidation: !r.accepted && m.writes.length === 3,
      ...r,
      writeCount: m.writes.length,
    };
  },
);

await check(
  "codec_low_length_0x23_collision",
  "A well-formed plain OTA frame of length35 must decode correctly",
  async () => {
    const frame = codec.buildOtaFrame(0x50, new Uint8Array(30));
    const decoded = codec.decodeIncomingFrame(frame);
    return {
      passesValidation: decoded?.frameType === "ota" && decoded.cmd === 0x50,
      frameLength: frame.length,
      decoded,
    };
  },
);

await check(
  "full_control_all_early_acks",
  "Every full-image ACK may arrive before its write settles",
  async (clock) => {
    const image = controlImage(),
      a = analyzeFirmwareForOta("synthetic-vnse-control.bin", image),
      m = makeManager(clock, { earlyAll: true }),
      ota = new OtaManager(m.manager);
    const r = await outcome(clock, ota.run(image, a, noop, noop));
    const frames = commandWrites(m, 0x51).map((w) =>
      codec.decodeIncomingFrame(w.bytes),
    );
    const same =
      Buffer.compare(
        image,
        new Uint8Array(
          frames.flatMap((f) => Array.from(f.payload.subarray(5))),
        ).subarray(0, image.length),
      ) === 0;
    return {
      ...r,
      passesValidation:
        r.accepted && same && frames.length === image.length / 128,
      chunkCount: frames.length,
      identicalImageBytes: same,
    };
  },
);

for (const [name, prefix] of [
  ["noise", new Uint8Array([0, 1, 2, 0xff, 0x72])],
  ["invalid_small_length", new Uint8Array([0x73, 0, 2, 0])],
  ["invalid_large_length", new Uint8Array([0x73, 0xff, 0xff, 0])],
])
  await check(
    `frame_resync_${name}`,
    "Malformed framing preceding a valid ACK must resynchronize",
    async (clock) => {
      const m = makeManager(clock, { prefix, cmd: 0x50 }),
        ota = new OtaManager(m.manager),
        r = await call(clock, ota, "sendSize", [
          bytes.length,
          analysis.checksum,
          noop,
        ]);
      return { ...r, passesValidation: r.accepted };
    },
  );

await check(
  "bad_checksum_then_valid_ack",
  "Corrupt frame must not prevent a subsequent valid ACK from completing exchange",
  async (clock) => {
    const m = makeManager(clock, { corruptThenValid: true, cmd: 0x50 }),
      ota = new OtaManager(m.manager),
      r = await call(clock, ota, "sendSize", [
        bytes.length,
        analysis.checksum,
        noop,
      ]);
    return { ...r, passesValidation: r.accepted };
  },
);

await check(
  "stale_partial_frame_timeout_recovers",
  "Stale incomplete prefix must clear so a later valid ACK can be decoded",
  async (clock) => {
    const m = makeManager(clock, { drop: true, cmd: 0x50 }),
      ota = new OtaManager(m.manager);
    const promise = ota.sendSize(bytes.length, analysis.checksum, noop);
    clock.set(() => m.notify(new Uint8Array([0x73, 0, 40, 0x50, 0])), 10);
    clock.set(
      () =>
        m.notify(
          codec.buildOtaFrame(
            0x50,
            new Uint8Array([
              0,
              ...codec
                .buildSizeFrame(bytes.length, analysis.checksum)
                .subarray(5, -1),
            ]),
          ),
        ),
      1200,
    );
    const r = await outcome(clock, promise);
    return { ...r, passesValidation: r.accepted };
  },
);

for (const [name, cmd, payload, method, args] of [
  [
    "size",
    0x50,
    new Uint8Array([
      0x10,
      ...codec.buildSizeFrame(bytes.length, analysis.checksum).subarray(5, -1),
    ]),
    "sendSize",
    [bytes.length, analysis.checksum, noop],
  ],
  [
    "chunk",
    0x51,
    new Uint8Array([0x10, 0, 0, 0, 0]),
    "sendChunks",
    [bytes.subarray(0, 128), noop, noop],
  ],
  ["final", 0x52, new Uint8Array([0x10, 1]), "finalize", [analysis, noop]],
])
  await check(
    `${name}_wrong_direction_rejected`,
    "Host-direction echoed frame must not be accepted as device ACK",
    async (clock) => {
      const m = makeManager(clock, { payload, cmd }),
        ota = new OtaManager(m.manager),
        r = await call(clock, ota, method, args);
      return { ...r, passesValidation: !r.accepted };
    },
  );

await check(
  "discovery_nonzero_resume_rejected",
  "Unsupported partial resume must reject rather than restart silently",
  async (clock) => {
    const m = makeManager(clock, {
        payload: new Uint8Array([0, 128, 0, 0, 0, 1, 0xaa]),
        cmd: 0x3a,
      }),
      ota = new OtaManager(m.manager),
      r = await call(clock, ota, "discover", [3, noop]);
    return { ...r, passesValidation: !r.accepted && m.writes.length === 1 };
  },
);

await check(
  "size_wrong_echoed_size",
  "Incorrect size with the correct checksum must reject",
  async (clock) => {
    const payload = new Uint8Array([
        0,
        ...codec
          .buildSizeFrame(bytes.length + 128, analysis.checksum)
          .subarray(5, -1),
      ]),
      m = makeManager(clock, { payload, cmd: 0x50 }),
      ota = new OtaManager(m.manager),
      r = await call(clock, ota, "sendSize", [
        bytes.length,
        analysis.checksum,
        noop,
      ]);
    return { ...r, passesValidation: !r.accepted };
  },
);

await check(
  "delayed_previous_chunk_ack_ignored",
  "Previous chunk offset arriving before current ACK must not consume current waiter",
  async (clock) => {
    const m = makeManager(clock, {
        onSend: async (raw, response, ctx) => {
          const d = codec.decodeIncomingFrame(raw);
          if (d?.cmd === 0x51 && d.payload[1] === 128)
            ctx.clock.set(
              () =>
                ctx.notify(
                  codec.buildOtaFrame(0x51, new Uint8Array([0, 0, 0, 0, 0])),
                ),
              1,
            );
        },
      }),
      ota = new OtaManager(m.manager),
      r = await call(clock, ota, "sendChunks", [
        bytes.subarray(0, 256),
        noop,
        noop,
      ]);
    return {
      ...r,
      passesValidation: r.accepted && commandWrites(m, 0x51).length === 2,
      writeCount: commandWrites(m, 0x51).length,
    };
  },
);

for (const type of ["normal", "transition"]) {
  await check(
    `${type}_dashboard_frame_fragmentation`,
    "Ordinary dashboard responses must still reach packet subscribers after reassembly",
    async (clock) => {
      const m = makeManager(clock),
        packets = [],
        frames = [];
      const payload = new Uint8Array([7, 8, 9, 10]);
      const frame =
        type === "normal"
          ? new VenusPacket(0x04, payload).toBytes()
          : codec.buildTransitionHmFrame(0x04, Array.from(payload));
      m.manager.subscribe(0x04, (packet) => packets.push(packet));
      m.manager.subscribeFrames((bytes) => frames.push(bytes));
      m.notify(frame.subarray(0, 3));
      assert.equal(packets.length, 0);
      m.notify(frame.subarray(3));
      return {
        passesValidation:
          packets.length === 1 &&
          frames.length === 1 &&
          Buffer.compare(packets[0].payload, payload) === 0 &&
          m.manager.rxAssembly.length === 0,
      };
    },
  );
}

await check(
  "mixed_dashboard_and_ota_frames",
  "Coalesced dashboard and OTA frames must each reach the appropriate subscribers",
  async (clock) => {
    const m = makeManager(clock),
      packets = [],
      frames = [];
    const normal = new VenusPacket(0x04, new Uint8Array([1, 2])).toBytes();
    const ota = codec.buildOtaFrame(0x50, new Uint8Array([0, 1, 2, 3]));
    const transition = codec.buildTransitionHmFrame(0x04, [3, 4]);
    m.manager.subscribe(0x04, (packet) => packets.push(packet));
    m.manager.subscribe(0x50, (packet) => packets.push(packet));
    m.manager.subscribeFrames((bytes) => frames.push(bytes));
    m.notify(new Uint8Array([...normal, ...ota, ...transition]));
    return {
      passesValidation:
        packets.length === 2 &&
        packets.every((p) => p.commandId === 0x04) &&
        frames.length === 3 &&
        m.manager.rxAssembly.length === 0,
    };
  },
);

await check(
  "write_rejection_after_early_ack_cleans_waiter",
  "An early valid ACK must not override a later rejected write, and the waiter must be removed",
  async (clock) => {
    const m = makeManager(clock, {
        onSend: async (raw, response, ctx) => {
          if (codec.decodeIncomingFrame(raw)?.cmd === 0x50) {
            ctx.notify(
              codec.buildOtaFrame(
                0x50,
                new Uint8Array([
                  0,
                  ...codec
                    .buildSizeFrame(bytes.length, analysis.checksum)
                    .subarray(5, -1),
                ]),
              ),
            );
            throw new Error("simulated write rejection after ACK");
          }
        },
      }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendSize", [
      bytes.length,
      analysis.checksum,
      noop,
    ]);
    return {
      ...r,
      passesValidation:
        !r.accepted &&
        r.error === "simulated write rejection after ACK" &&
        m.manager.frameListeners.size === 0,
    };
  },
);
await check(
  "early_ack_requires_write_completion",
  "A valid early ACK must not complete an exchange whose write never settles within the budget",
  async (clock) => {
    const m = makeManager(clock, {
        onSend: async (raw, response, ctx) => {
          if (codec.decodeIncomingFrame(raw)?.cmd === 0x50) {
            ctx.notify(
              codec.buildOtaFrame(
                0x50,
                new Uint8Array([
                  0,
                  ...codec
                    .buildSizeFrame(bytes.length, analysis.checksum)
                    .subarray(5, -1),
                ]),
              ),
            );
            await new Promise((resolve) => ctx.clock.set(resolve, 10000));
          }
        },
      }),
      ota = new OtaManager(m.manager);
    const r = await call(clock, ota, "sendSize", [
      bytes.length,
      analysis.checksum,
      noop,
    ]);
    return {
      ...r,
      passesValidation:
        !r.accepted &&
        /timeout/i.test(r.error) &&
        clock.now === 5000 &&
        m.manager.frameListeners.size === 0,
      elapsedVirtualMs: clock.now,
    };
  },
);

for (const stage of ["discover", "sendChunks"])
  await check(
    `${stage}_unsettled_write_is_not_retryable`,
    "A write that never settles must fail once rather than retrying an outstanding transport operation",
    async (clock) => {
      const cmd = stage === "discover" ? 0x3a : 0x51;
      const m = makeManager(clock, {
        onSend: async (raw) => {
          if (codec.decodeIncomingFrame(raw)?.cmd === cmd)
            await new Promise(() => {});
        },
      });
      m.manager.suspendPolling();
      const ota = new OtaManager(m.manager);
      const args = stage === "discover" ? [3, noop] : [bytes, noop, noop];
      const result = await call(clock, ota, stage, args);
      const budget =
        stage === "discover"
          ? ota.timings.discoverAckMs
          : ota.timings.chunkAckMs;
      return {
        ...result,
        passesValidation:
          !result.accepted &&
          /Write timeout/.test(result.error) &&
          clock.now === budget &&
          commandWrites(m, cmd).length === 1,
        elapsed: clock.now,
        budget,
      };
    },
  );

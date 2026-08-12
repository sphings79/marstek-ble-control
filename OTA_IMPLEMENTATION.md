# OTA firmware update implementation

This project's README explicitly called OTA out as the one remaining unsolved, risky piece and
was skeptical of AI-assisted attempts at it. This documents a full port of the OTA logic already
implemented and Ghidra-verified in the sibling "Marstek Venus Monitor" project (see that
project's `VENUS_D_OTA_ADAPTATION.md` for the underlying research), adapted to this project's
architecture.

**Not yet live-tested.** Web Bluetooth requires a real browser with a paired device; that wasn't
available in the environment this port was written in. The framing, checksum, and sequencing
logic is an unchanged port of an implementation that has worked in practice for Control/EMS and
BMS updates - but treat the first real run of this code as the actual test.

## Files added

- `src/lib/ota/OtaFrameCodec.ts` - frame encode/decode. OTA uses a different frame shape than
  the regular `VenusPacket` (2-byte big-endian length, no `0x23` marker byte in most cases).
  Ported byte-for-byte from the reference implementation's `buildOtaFrame` /
  `buildTransitionHMFrame` / `buildSizeFrame` / `buildDataFrame` / `buildFinishFrame` and its
  `handleUnifiedNotification` frame-shape discriminator (`value[2] === 0x23 || value[3] === 0x23`
  decides normal-HM vs. transition-HM vs. plain-OTA framing).
- `src/lib/ota/FirmwareAnalysis.ts` - the same model-mismatch (Venus D vs. Venus E) and
  component-detection (Control/EMS vs. MPPT vs. BMS vs. Micro/Inverter) safety checks from the
  sibling project, including the Ghidra-derived OTA type-flag mapping. Re-verified against the
  same real firmware files (6 Venus D + 4 Venus E 3.0 samples) using this exact TypeScript
  module - 8/8 correct (model + component + type flag).
- `src/lib/ota/OtaManager.ts` - orchestrates the full sequence: activate (`0x54` + transition
  `0x10`) -> `0x3A` discovery probe with the detected type flag (retried 3x) -> `0x50` size+checksum
  -> `0x51` chunk loop (128 bytes/chunk, 3 retries per chunk) -> `0x52` finalize. Reports progress
  and log lines via callbacks.
- `src/components/widgets/OtaWidget.tsx` - file picker, model/component detection display,
  progress bar, scrolling log, and a single MUI confirmation dialog covering both the
  model-mismatch and non-EMS-component warnings (the reference implementation uses two sequential
  `window.confirm()` dialogs; this combines them into one dialog listing whichever warnings
  apply).
- Wired into `VenusDView` only, not `VenusAView` - the underlying protocol is very likely shared
  (see `VENUS_D_SUPPORT.md`'s STATE-payload cross-reference), but this hasn't been separately
  confirmed for Venus A, and the user's focus has been Venus D.

## Changes to existing files

- `src/lib/BLEConnectionManager.ts`:
  - `onRawNotification` - new public callback fired for every incoming notification, regardless
    of frame shape (OTA frames fail `VenusPacket.fromBytes()`'s length check, since they use a
    2-byte length field where `VenusPacket` expects 1 byte).
  - The `characteristicvaluechanged` handler now only attempts the normal `VenusPacket` parse
    when `bytes[2] === 0x23` (a real HM frame), avoiding console-spamming parse-error warnings
    for every OTA frame that arrives while an update is in progress.
  - `sendRaw(bytes)` - writes pre-built raw frames via `writeValueWithoutResponse`, sharing the
    same `txMutex` as `sendPacket()` so OTA writes and regular command writes can never interleave
    on the wire.
  - `suspendPolling()` / `resumePolling()` - public wrappers so OTA can pause the periodic STATE
    poll (`doPoll()` normally fires every 5s) for the duration of the update. The reference
    implementation disables all other command traffic during OTA; this app has an active polling
    loop that the old vanilla-JS tool didn't, so this is a new (but analogous) precaution rather
    than a straight port.

## What this does NOT do

- Does not implement any CAN-relay protocol for MPPT/BMS/VNS-Micro firmware. Per the Ghidra
  findings (see the sibling project's docs), the Control MCU handles that relay internally once
  it accepts a transfer - this code only needs to send the right type flag.
- Does not verify the firmware's *content* is valid for the specific device beyond the
  model/component heuristics - there's no way to check firmware compatibility more precisely than
  what's documented in `FirmwareAnalysis.ts`.
- Does not persist or resume interrupted transfers - a failed run must be restarted from scratch
  (matching the reference implementation).

## Verification performed

- `npx tsc -b` - compiles cleanly (had to avoid TypeScript constructor parameter properties in
  `OtaManager`, since this project's `tsconfig` has `erasableSyntaxOnly` enabled).
- `npx eslint` on all new/changed files - no new warnings. (Pre-existing `no-explicit-any`
  warnings in `BLEConnectionManager.ts` are unchanged from before this work - confirmed by
  running eslint against an unmodified copy of the file.)
- `npx vite build` - production build succeeds (had to build from a scratch copy outside the
  synced project folder, since a stale `dist/` from an earlier build in this environment couldn't
  be overwritten due to a filesystem permission quirk specific to this sandbox - not expected to
  affect a normal local build).
- Ran `FirmwareAnalysis.ts`'s `detectFirmwareTargetModel` / `detectFirmwareComponentType`
  directly (via `node --experimental-strip-types`) against all 10 real firmware files in the
  sibling project's folder - 8 spot-checked, all correct.
- No live BLE test - this remains the key open item.

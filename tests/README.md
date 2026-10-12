# OTA regression tests

Run `npm ci` and `npm test` with Node.js 22.18+ or 24+ ([native TypeScript stripping](https://nodejs.org/api/typescript.html#type-stripping)). The production app's build/runtime requirements are unchanged.

`ota-acks.test.mjs` covers full Control/BMS transfers, replies before write completion, fragmented/coalesced/unrelated/stale notifications, checksum and direction checks, discovery refusal/resume offsets, echoed size/checksum/chunk offsets, bounded ACK retries, write rejection after an early ACK, and ordinary dashboard frame delivery.

The tests execute the actual `OtaManager`, `BLEConnectionManager`, frame codec and installed `semaphore` dependency. Only the transport/device and UI translation are replaced. Shared helpers use a virtual clock, drain queued promise/nextTick work before advancing it and restore timers/logging in `finally`. Cases and test files run sequentially.

Images are generated from a repeating byte pattern, the public `VNSE` model signature and component trailers. They are synthetic protocol fixtures, not executable firmware. No downloads, vendor binaries, browser, battery or Bluetooth connection are required, and tests do not write result files.

These tests validate sender behavior and framing. They do not establish physical installation, bootloader recovery, all-model compatibility or long-term stability. `ota-lifecycle.test.mjs` additionally covers exclusive connection ownership, draining prior writes, polling races, cancellation/disconnect across transfer phases, immutable image/metadata checks, overlap guards, successful/failed cleanup and the reconnect requirement on every command path.

The run guard accepts complete 128-byte-aligned images only. All 38 A/D/E 3.0 entries in the public archive index at commit `00ee19c29eee255db718639e29ff146e05eeb560` have aligned sizes; arbitrary unaligned files remain unsupported. This is a conservative input constraint, not evidence that every device requires alignment.

# OTA regression tests

Run `npm ci` and `npm test` with Node.js 22.18+ or 24+ ([native TypeScript stripping](https://nodejs.org/api/typescript.html#type-stripping)). The production app's build/runtime requirements are unchanged.

`ota-acks.test.mjs` covers full Control/BMS transfers, replies before write completion, fragmented/coalesced/unrelated/stale notifications, checksum and direction checks, discovery refusal/resume offsets, echoed size/checksum/chunk offsets, bounded ACK retries, write rejection after an early ACK, and ordinary dashboard frame delivery.

The tests execute the actual `OtaManager`, `BLEConnectionManager`, frame codec and installed `semaphore` dependency. Only the transport/device and UI translation are replaced. Shared helpers use a virtual clock, drain queued promise/nextTick work before advancing it and restore timers/logging in `finally`. Cases and test files run sequentially.

Images are generated from a repeating byte pattern, the public `VNSE` model signature and component trailers. They are synthetic protocol fixtures, not executable firmware. No downloads, vendor binaries, browser, battery or Bluetooth connection are required, and tests do not write result files.

These tests validate sender behavior and framing. They do not establish physical installation, bootloader recovery, all-model compatibility or long-term stability. Transfer ownership, cancellation and reconnect behavior are covered by the dependent lifecycle contribution.

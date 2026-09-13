# Changelog

Notable changes to the Marstek BLE Control web interface.

This app ships two ways from one build: hosted, where it talks to the storage over Web Bluetooth,
and from the flash of the [Marstek BLE Bridge](https://github.com/sphings79/marstek-ble-bridge),
which serves this same interface. The two are released together and share this version line — the
bridge's releases carry the matching firmware and installer. On the hosted copy an update simply
arrives on the next page load.

## v1.3.6 — 2026-09-12
- After Apply, fields hold the value you set until the next poll lands, instead of flashing the
  device's old value for a moment (self-consumption offset and local-API cards).
- The self-consumption offset notes that it is capped by the power limits — a positive value by the
  charge limit, a negative one by the discharge limit — so a positive offset lands on 0 when the
  charge limit is 0.

## v1.3.5 — 2026-09-12
- The self-consumption offset is read back from the device and shown, instead of resetting to 0 on
  every reload.
- The offered-update progress reads "installing…" instead of a stuck 0 % while the bridge fetches
  the image itself; a hand-uploaded file keeps its real percentage bar.

## v1.3.4 — 2026-09-12
- The device power class offers each model the values its firmware actually accepts: Venus A
  800/1200/1500 W, Venus D 800/2200/2500 W, Venus E 3.0 600/800/2500 W (Venus A had shown
  2200/2500 W, which it ignores, and hidden its real 1200/1500 W).
- The Venus E 3.0 gains its 600 W class (for countries capped at 600 W, with a note) and drops the
  free discharge-limit control, which its firmware governs through the power class.

## v1.3.3 — 2026-09-12
- Venus E 3.0 (VNSE3) support. Its status frame is shorter than the Venus D's and used to crash the
  parser, leaving the whole panel spinning; its own layout is now read — state of charge, battery
  and grid power, charge/discharge limits, CT, work mode, depth of discharge, LED and Bluetooth.
- The CT card says when no meter is connected instead of spinning, and the local-API card shows the
  device's real on/off and port.

## v1.3.2 — 2026-09-06
- Module States reads as many module entries as the frame actually holds, so it works with seven
  battery packs instead of showing nothing.

## v1.3.1 — 2026-09-05
- A reconnect the storage refuses is retried.

## v1.3.0 — 2026-09-05
- The stored bridge survives a page reload, and a failed connect is no longer silent.

## v1.2.0 — 2026-09-05
- The interface is fully translated into German, including the messages from outside React.

## v1.1.0 — 2026-09-05
- Bridge mode: claiming, login and device selection, a bridge firmware card reachable with or
  without a storage connected, and the bridge's own WiFi signal shown beside the Bluetooth one.

## v1.0.0 — 2026-09-04
- First release alongside the bridge: Venus A, Venus D and Venus E 3.0, work modes and schedules,
  charge/discharge and power-class limits, peak shaving, local API, CT/meter setup, depth of
  discharge, and OTA firmware updates.

# Changelog

Notable changes to the Marstek BLE Control web interface.

This app ships two ways from one build: hosted, where it talks to the storage over Web Bluetooth,
and from the flash of the [Marstek BLE Bridge](https://github.com/sphings79/marstek-ble-bridge),
which serves this same interface. The two are released together and share this version line — the
bridge's releases carry the matching firmware and installer. On the hosted copy an update simply
arrives on the next page load.

## v1.4.0-beta.13 — 2026-11-15
**Beta.** No change to the web interface; the version follows bridge firmware v1.4.0-beta.13 (a test for a Venus D that stops answering after about 25 s).

## v1.4.0-beta.12 — 2026-11-15
**Beta.** No change to the web interface; the version follows bridge firmware v1.4.0-beta.12 (more diagnostics in the link log).

## v1.4.0-beta.11 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.10 or newer.
- **Fix: the bridge update card did not offer the newest beta.** GitHub lists releases by tag name as
  text, not by date (`beta.9` before `beta.10`), and the card took the first entry. It now offers the
  most recently published release and asks GitHub for 30 entries instead of 10.

## v1.4.0-beta.10 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.10, which stops the storages from going silent after 30 s.
- A slot that connects no longer keeps the error message of an earlier failed attempt (for example
  "The storage dropped the connection before it was usable") while it shows as connected.

## v1.4.0-beta.9 — 2026-11-15
**Beta.** No change to the web interface; the version follows bridge firmware v1.4.0-beta.9, which keeps connected slots from going silent.

## v1.4.0-beta.8 — 2026-11-15
**Beta.** No change to the web interface; the version follows the bridge firmware v1.4.0-beta.8 (diagnostic log).

## v1.4.0-beta.7 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.7 (which carries the fix for kept slots that went silent).
- The slots are named *Device 1-3* instead of *Storage 1-3* (slot bar and the *Connection* card).

## v1.4.0-beta.6 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.3 or newer.
- When the web interface is served by a bridge, *Star on GitHub* (footer and menu) links to the
  marstek-ble-bridge repository instead of the Control repository. The hosted app keeps linking to Control.

## v1.4.0-beta.5 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.3 or newer.
- Going back from a beta to a stable version no longer ends in a dead end. If the bridge runs older
  firmware than this web interface (for example after installing the stable firmware first), the page
  now shows the login and the update card instead of only a "bridge too old" message, so the matching
  web interface can be installed.
- The update card warns when it offers a switch between beta and stable (either direction): install
  both the web interface and the firmware, one after the other.

## v1.4.0-beta.4 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.3 or newer.
- The bridge update card has a switch, *Include beta versions* (off by default, remembered in the
  browser). GitHub's "latest release" never lists prereleases, so betas were invisible there. With the
  switch on, the newest release including betas is offered, with a note to install firmware and web
  interface of the same version together.

## v1.4.0-beta.3 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.3.
- The *Connection* card has a switch per slot, *Keep connected permanently*, with a clear warning and a
  confirmation: while the bridge is connected, the manufacturer's app cannot connect, because a storage
  only talks to one Bluetooth device at a time. Kept slots ignore the hold time.

## v1.4.0-beta.2 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.2 (protocol version 2).
- Slot switching, binding a device and removing one are locked while a firmware update is running.
- New card *Connection*: how long (5-3600 s) the bridge keeps the storages connected after the last
  browser or REST command.
- The *API token* card also shows a Home Assistant `rest` sensor example for `/api/status`, to check the
  bridge, its slots and the last REST command from Home Assistant.

## v1.4.0-beta.1 — 2026-11-15
**Beta.** Works with bridge firmware v1.4.0-beta.1 only (protocol version 2); an older bridge shows a
message asking for an update. Not yet tested against real storages in several slots.
- Three storages per bridge: a slot bar picks the storage; every slot keeps its own connection and only
  the selected one is polled. Switching never disconnects. The device picker binds to the chosen slot
  and a slot can be cleared again.
- New card *API token* (bridge only): create, replace or switch off the token Home Assistant uses to
  switch peak shaving over REST, with a copy-ready `rest_command` example. The token is shown once.
- Over Web Bluetooth (hosted app) nothing changes: still one storage.

## v1.3.19 — 2026-11-15
- The version is shown in the page footer and at the bottom of the mobile menu.
- Firmware update: the transfer is isolated and a fresh connection is required before the next
  transfer or any normal command. After a successful transfer the page says that the device needs
  about 1 minute to finish installing, then to reconnect and check the version; the duplicated
  wording between the progress line and the hint is gone.

## v1.3.18 — 2026-11-14
- Firmware upload: replies are now checked for the right frame after reassembly, so a stray or split
  frame can no longer be mistaken for the acknowledgement of a block (fix by Ruben J. Jongejan).

## v1.3.17 — 2026-11-13
- Venus E v1/v2 (`MST_ACCP_xxxx`, device type HMG-50) gets its own view. **Not tested on real
  hardware**: it is based on reading the Control firmware only. Work mode including economy/AI, power
  class (800 / 2500 W), charge and discharge limits, backup power, depth of discharge (30–90 %,
  firmware 156+), Bluetooth switch (156+), CT mode and readings, local API and set time.
- Not offered for it because the firmware has no such command, or it could not be confirmed: peak
  shaving, self-control offset, surplus feed-in, battery modules, OTA, factory reset, CT meter type,
  LED switch.
- Firmware files named `ac_app_…` are no longer taken for a Venus E 3.0; Venus E v1/v2 control images
  are recognised by their `MST_ACCP` tag.

## v1.3.15 — 2026-10-01
- The firmware archive picker groups the images by component in collapsible sections, marks the
  version that is installed on the device, and uses the card styling of the rest of the page.
- Test builds show as 149.2 (Beta) instead of 1492, in the archive picker and in the device info.
- Factory reset: the buttons sit at the top of the card, and the second one says it deletes all data.

## v1.3.14 — 2026-10-01
- New "Pick from archive" button on the firmware update card: lists the images for the connected model
  (Control, BMS, Micro) straight from the firmware archive on GitHub, newest first with release notes,
  downloads the chosen one, verifies its SHA-256 and runs it through the same checks as a file you pick
  yourself. Venus A, D and E 3.0.
- "Schaltet die Notstromsteckdose an/aus" wording fix.
- Internal cleanup: the connection provider no longer reads a ref while rendering, and a few lint
  findings are gone. No behaviour change intended.

## v1.3.13 — 2026-10-01
- Plainer wording throughout: "SoC" instead of "State of Charge/Ladezustand", clearer descriptions for the
  backup power, surplus feed-in, LED and Bluetooth switches, and the BLE command numbers are gone from the
  notes. The legal-regulations hint is now a single sentence.
- The device-info versions name every component (EMS, BMS, VNS, MPPT).
- The device time card explains where the battery gets its time (cloud, or the Marstek Offline Endpoint)
  and links to it.
- The bridge-connected firmware-update warning and the bridge-password explainer are removed; the
  bridge firmware card shows firmware and interface versions as chips and tucks hand-built uploads
  into a collapsible "Manual update".
- Footer and phone menu: a thank-you to Hypfer, links to the Modbus Suite and the Offline Endpoint,
  and on a phone the project links sit behind a collapsible "More projects" entry.

## v1.3.12 — 2026-10-01
- The Bluetooth reading in the header doubles as the link indicator: dBm while connected, "connecting…"
  in orange while the link comes up, "lost" in red when it is gone. On a phone it sits in the pinned
  section bar, so a dropped connection is visible even after scrolling down.

## v1.3.11 — 2026-10-01
- The header shows the Bluetooth symbol instead of the cellular bars, and Bluetooth and WiFi are just
  the dBm value; the tooltip says which link it is.
- On a phone the device header scrolls away and only the section bar stays pinned. It now carries the
  Bluetooth and WiFi signal readings, so they remain visible.

## v1.3.10 — 2026-10-01
- Firmware update: the technical notes about the Micro/Inverter component are gone, and starting an
  update always asks one short "really start?" question. After a finished update the loaded file is
  cleared so the start button cannot be pressed twice, and the log follows the newest line.
- Power limits are now a "Power" card with 0 to max sliders (50 W steps) for charge and discharge;
  the device power class keeps its buttons.
- The schedule hint explains where the battery gets its time (cloud, or the Marstek Offline Endpoint)
  and links to it.
- On a phone the section bar with the menu button stays visible below the header while scrolling.

## v1.3.8 — 2026-09-13
- EMS, BMS and Micro-Inverter (VNS) updates are hardware-confirmed on a Venus D and a Venus E 3.0,
  so the VNS firmware-update note is a plain info line instead of a "not confirmed on real hardware"
  warning. MPPT keeps the caution, only because no MPPT image is in the firmware archive to flash yet.

## v1.3.7 — 2026-09-13
- The offered update shows a real progress bar: it reads the download-and-flash progress the bridge
  now streams, filling with a percentage instead of an indeterminate bar (an older bridge that
  streams none still falls back to indeterminate).
- After a web-interface update the page reloads itself, so the freshly installed interface takes
  over instead of the old one lingering in the tab.

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

# Venus D support

Adds Marstek Venus D (`VNSD-0`, BLE name `MST_VNSD_xxxx`) recognition to this project.

## What changed

- `src/lib/DeviceUtils.ts` — `parseDeviceName()` now maps the `VNSD` name segment to
  `modelName: "Venus D"` (alongside the existing `VNSA` → "Venus A").
- `src/components/views/VenusDView.tsx` — new view, reusing the existing widgets
  (`StateWidget`, `BatteryModulesStateWidget`, `WorkModeWidget`, `CTWidget`, `TogglesWidget`,
  `DepthOfDischargeWidget`, `PowerLimitsWidget`, `DeviceInfoWidget`, `FactoryResetWidget`)
  rather than duplicating them, since Venus D uses the same command ID set as Venus A
  (`COMMAND_ID.STATE`, `DEVICE_INFO`, `GET_WORK_MODE_SETTINGS`, etc.).
- `src/App.tsx` — routes `modelName === "Venus D"` to `VenusDView`.

## Why widget reuse is reasonable here

`StatePayload.FROM_BYTES` (Venus A, this project) and the Venus D BLE `RuntimeInfo`
cross-reference (Ghidra-decompiled directly from the Venus D Control firmware's own BLE
RuntimeInfo builder function, in the sibling "Marstek Venus D FW Debug" project's
`BLE_Modbus_CrossReference.md`) agree at every offset that's confirmed on both sides:

| Offset | This project (Venus A) | Venus D FW cross-reference |
|---|---|---|
| `0x00` | `UnknownPower01` (i16) | `gridPower` / `ac_power` |
| `0x02` | `BatteryPower` (i16) | `batteryPower` |
| `0x04` | `InverterState` (u8) | `workMode` / `inverter_state` (reg 35100) |
| `0x0E` | `DailyEnergyIn` (u32 × 10 → Wh) | `dailyCharge` (u32 ÷ 100 → kWh) — same raw scale, different display unit |
| `0x16` | `DailyEnergyOut` (u32 × 10 → Wh) | `dailyDischarge` (u32 ÷ 100 → kWh) — same |
| `0x29` | `TotalEnergyIn` (u32 × 10 → Wh) | `totalCharge` (u32 ÷ 100 → kWh) — same |
| `0x2D` | `TotalEnergyOut` (u32 × 10 → Wh) | `totalDischarge` (u32 ÷ 100 → kWh) — same |

This was strong (though at the time not conclusive) evidence that the STATE payload - and by
extension the whole command protocol - is shared across the Venus product line, not just
coincidentally similar.

> **Status update: this is now confirmed on real hardware.** Venus D support has been tested
> against a real, connected Venus D device. VNS and BMS OTA updates have additionally been
> reported working by users. The paragraphs below were written before that testing; what
> remains genuinely unverified is listed under "What is still unverified".

## What is still unverified

The connection, the STATE payload and the widgets built on them work against real Venus D
hardware. What has *not* been individually cross-checked against decompiled Venus D firmware is
narrower than it was:

- **Commands besides STATE/DEVICE_INFO at the firmware level.** WorkMode settings, CT readings,
  Battery Modules State, Toggles and the rest behave correctly on a live device, but their byte
  layouts were inferred from protocol similarity rather than read out of decompiled Venus D
  firmware. A field that is never exercised in normal use could still be wrong.
- **Numeric tuning parameters in `VenusDView`:**
  - Power limit options (`800/1200/1500/2000/2500` W) - the 2500 W ceiling is FW-confirmed
    (Venus D Modbus write registers `42020`/`42021`, documented range 0-2500 W; also the
    Micro/inverter firmware's own "Max-Power-Cap 2500 W (`0x9C4`)" finding), but the specific
    preset steps offered are a guess, not a confirmed list from the vendor app.
  - Depth-of-discharge min/max - left at the widget's Venus-A-derived defaults (30-88%)
    because no Venus D-specific range has been confirmed. Needs live verification.
  - UPS/schedule support (`scheduleItemUPSSupported={true}`) - assumed available based on
    Venus D having a physical backup/off-grid relay (`IO_RELAY_OFFGRID`, confirmed via Ghidra
    analysis of the Micro/inverter firmware's GPIO map), not from a live BLE test.

## Related work

- Sibling project "Marstek Venus Monitor" → `marstek-venus-monitor-main/VENUS_D_OTA_ADAPTATION.md`
  documents Venus D adaptation and OTA type-flag fixes made to the older vanilla-JS tool this
  project reimplements. That OTA logic (Ghidra-verified 4-slot type-flag mapping for
  EMS/MPPT/BMS/VNS-Micro components) has since been ported into this project too - see
  `OTA_IMPLEMENTATION.md` in this repo.
- "Marstek Venus D FW Debug" project - the underlying Ghidra reverse-engineering (Control FW
  149.2, Micro FW 116, BMS FW 177.7) that both adaptations draw on.

## Verification performed

- `npx tsc -b` - compiles cleanly.
- `npx eslint` on the changed/added files - no warnings.
- `npx vite build` - production build succeeds.

No live BLE test against a real Venus D was possible in this environment (Web Bluetooth
requires a real browser + device pairing) - that remains the key open verification step.

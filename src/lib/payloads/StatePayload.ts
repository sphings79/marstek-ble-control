import { VenusPayload } from "./VenusPayload";

// FIXME: why is there no Grid connected flag?

export interface StateAttributes {
    // Backup / off-grid (EPS) load power at 0x00, signed W. User-confirmed: 0 W normally, ~93 W with
    // a backup load connected. (This is what the old code / ha-marstek loosely called "grid".)
    BackupLoadPower: number;
    // Total AC / inverter output power at 0x02, signed W. Matches HA "AC-Leistung" (569 W while
    // discharging). Historically mislabelled "battery power".
    AcOutputPower: number;
    InverterState: number; // As per INVERTER_STATE
    CTConnected: boolean;

    // Not all of this is usable, given that the battery won't discharge below 10%. Not sure why it gives us this number
    // Or maybe it does, but just in emergency power mode?
    RemainingEnergy: number; // Wh
    SoC: number;

    // These must need a time reference. FIXME: how does the thing even know the time? And can we know which time it knows?
    DailyEnergyIn: number; // Wh
    DailyEnergyOut: number; // Wh
    MonthlyEnergyIn: number; // Wh
    MonthlyEnergyOut: number; // Wh

    WorkMode: number; // As per WORK_MODE

    TotalEnergyIn: number; // Wh
    TotalEnergyOut: number; // Wh

    BackupPower: boolean;
    ChargePowerLimit: number;
    DischargePowerLimit: number;
    CTType: number; // As per CT_TYPE
    Phase: number; // As per PHASE
    CTMode: number; // As per CT_MODE

    CommunicationModuleFirmwareVersion: string;

    SurplusFeedIn?: boolean

    // Per-MPPT (PV string) power, only present on the extended payload. Reported in 0.1 W units.
    // Offsets from upstream (Hypfer/venuscontrol#2, confirmed on a Venus A with MPPT add-on):
    // 3-byte triplets starting at 0x6B (107): uint16 power + 1 byte enable flag.
    // Devices without PV inputs report 0 W / disabled for every channel.
    MPPT1Power?: number; // W
    MPPT1Enabled?: boolean;
    MPPT2Power?: number; // W
    MPPT2Enabled?: boolean;
    MPPT3Power?: number; // W
    MPPT3Enabled?: boolean;
    MPPT4Power?: number; // W
    MPPT4Enabled?: boolean;

    // Battery power at 0x8C (140), signed W (negative = discharge). Confirmed via HA cross-check
    // (-605 W in-app ≈ -615 W HA). Only present on the extended (Venus D) payload.
    BatteryPower?: number;
    // Grid (utility) power at 0x90 (144), signed W. Confirmed = AC output minus backup load: 569 W
    // with no backup, 476 W (= 569 - 93) with a 93 W backup load. Only on the extended payload.
    GridPower?: number;

    BluetoothEnabled?: boolean;
    DepthOfDischarge?: number; // percent, also FIXME naming? The app calls it that, but it's a bad name
    LEDLight?: boolean;

    // Local UDP JSON-RPC API: enable flag at byte[101] and port at byte[105] (u16 LE). Written at
    // the same offset by every model's RuntimeInfo builder (Venus A/D FUN_0800b024, Venus E 3.0
    // BLE_Build_RuntimeInfo_VNSE3), so it is read for all of them - not part of the model-specific
    // extended block below.
    LocalApiEnabled?: boolean;
    ApiPort?: number;
}

export class StatePayload extends VenusPayload {
    public attributes: StateAttributes;

    constructor(attributes: StateAttributes) {
        super();
        this.attributes = attributes;
    }

    static FROM_BYTES(bytes: Uint8Array): StatePayload {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        
        const attrs: StateAttributes = {
            BackupLoadPower: view.getInt16(0, true), // 0x00 = backup/off-grid load (user-confirmed)
            AcOutputPower: view.getInt16(2, true),   // 0x02 = total AC / inverter output (matches HA AC)
            InverterState: bytes[4],

            CTConnected: bytes[7] === 0x01,

            RemainingEnergy: view.getInt16(9, true) * 10,
            SoC: bytes[11],

            DailyEnergyIn: view.getUint32(14, true) * 10,
            MonthlyEnergyIn: view.getUint32(18, true), // For some reason provided by the FW with a different scale
            DailyEnergyOut: view.getUint32(22, true) * 10,
            MonthlyEnergyOut: view.getUint32(26, true) * 10,

            WorkMode: bytes[38],

            TotalEnergyIn: view.getUint32(41, true) * 10,
            TotalEnergyOut: view.getUint32(45, true) * 10,

            BackupPower: bytes[49] === 0x01,

            ChargePowerLimit: view.getUint16(72, true),
            DischargePowerLimit: view.getUint16(74, true),
            CTType: bytes[76],
            Phase: bytes[77],
            CTMode: bytes[78],

            CommunicationModuleFirmwareVersion: new TextDecoder().decode(bytes.slice(81, 93)),
        };

        // Local API enable + port live at byte[101] / byte[105] on every model (same builder offset
        // on Venus A/D and Venus E 3.0), ahead of the model-specific extended block. Guard only
        // against a payload too short to contain the port.
        if (bytes.length >= 107) {
            attrs.LocalApiEnabled = bytes[101] === 0x01;
            attrs.ApiPort = view.getUint16(105, true);
        }

        // Venus A / Venus D extended block. The field at the highest offset read here is LED at
        // byte[152], so the whole block requires a payload of at least 153 bytes. Venus D sends 167
        // (its RuntimeInfo builder, Control FW FUN_0800b024, fills up to byte[166]).
        //
        // The old gate was `> 110`, which let the Venus E 3.0 (VNSE3) through: its RuntimeInfo
        // builder omits the MPPT block and the multi-pack fields, so it sends only 133 payload
        // bytes with a *different* extended layout. Reading the Venus D offsets on it threw
        // "Offset is outside the bounds of the DataView" at getInt16(140), which killed the entire
        // STATE parse and left every STATE-driven widget stuck on its spinner. The E3.0 extended
        // fields live at their own offsets and are parsed separately below.
        if (bytes.length >= 153) {
            attrs.MPPT1Power = view.getUint16(107, true) / 10;
            attrs.MPPT1Enabled = bytes[109] === 0x01;
            attrs.MPPT2Power = view.getUint16(110, true) / 10;
            attrs.MPPT2Enabled = bytes[112] === 0x01;
            attrs.MPPT3Power = view.getUint16(113, true) / 10;
            attrs.MPPT3Enabled = bytes[115] === 0x01;
            attrs.MPPT4Power = view.getUint16(116, true) / 10;
            attrs.MPPT4Enabled = bytes[118] === 0x01;

            attrs.SurplusFeedIn = bytes[133] === 0x01;

            // Confirmed via live HA cross-check + a backup-load toggle test (see interface notes).
            attrs.BatteryPower = view.getInt16(140, true); // 0x8C = battery power (negative = discharge)
            attrs.GridPower = view.getInt16(144, true);    // 0x90 = grid power (= AC output - backup load)

            attrs.BluetoothEnabled = bytes[148] === 0x01;
            attrs.DepthOfDischarge = bytes[149];
            attrs.LEDLight = bytes[152] === 0x01;
        } else if (bytes.length >= 125) {
            // Venus E 3.0 (VNSE3) extended block. Its RuntimeInfo builder (Control FW
            // BLE_Build_RuntimeInfo_VNSE3 @0x0800a79c) omits the MPPT block and the multi-pack
            // fields that Venus A/D carry, so these fields sit 28 bytes earlier than on Venus D and
            // the payload is much shorter: 133 bytes on EMS 147, 139 on EMS 150. The 6-byte version
            // difference is a trailing block past every offset read here, so this layout holds for
            // both. Offsets were read out of the decompiled builder and confirmed against a real
            // EMS-147 capture (DoD 88 %, Bluetooth on, LED on all landed on these exact bytes).
            //
            // No MPPT (no PV) and no surplus feed-in on the E3.0, so those stay undefined on
            // purpose - StateWidget hides the PV tile and TogglesWidget is told not to show surplus.
            attrs.BatteryPower = view.getInt16(112, true); // fp64 power result (negative = discharge)
            attrs.GridPower = view.getInt16(116, true);    // sVar6 - sVar1, matches the Venus D grid formula
            attrs.BluetoothEnabled = bytes[120] === 0x01;
            attrs.DepthOfDischarge = bytes[121];
            attrs.LEDLight = bytes[124] === 0x01;
        }

        return new StatePayload(attrs);
    }

    toBytes(): Uint8Array {
        return new Uint8Array(0);
    }
}

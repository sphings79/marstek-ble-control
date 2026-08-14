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

    // Battery power at 0x8C (140), signed W (negative = discharge). Confirmed via HA cross-check
    // (-605 W in-app ≈ -615 W HA). Only present on the extended (Venus D) payload.
    BatteryPower?: number;
    // Grid (utility) power at 0x90 (144), signed W. Confirmed = AC output minus backup load: 569 W
    // with no backup, 476 W (= 569 - 93) with a 93 W backup load. Only on the extended payload.
    GridPower?: number;

    BluetoothEnabled?: boolean;
    DepthOfDischarge?: number; // percent, also FIXME naming? The app calls it that, but it's a bad name
    LEDLight?: boolean;
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

            // FIXME Maybe the 4 MPPT hide here? in 50-73? Or maybe not

            ChargePowerLimit: view.getUint16(72, true),
            DischargePowerLimit: view.getUint16(74, true),
            CTType: bytes[76],
            Phase: bytes[77],
            CTMode: bytes[78],

            CommunicationModuleFirmwareVersion: new TextDecoder().decode(bytes.slice(81, 93)),
        };

        if (bytes.length > 110) {
            attrs.SurplusFeedIn = bytes[133] === 0x01;

            // Confirmed via live HA cross-check + a backup-load toggle test (see interface notes).
            attrs.BatteryPower = view.getInt16(140, true); // 0x8C = battery power (negative = discharge)
            attrs.GridPower = view.getInt16(144, true);    // 0x90 = grid power (= AC output - backup load)

            attrs.BluetoothEnabled = bytes[148] === 0x01;
            attrs.DepthOfDischarge = bytes[149];
            attrs.LEDLight = bytes[152] === 0x01;
        }

        return new StatePayload(attrs);
    }

    toBytes(): Uint8Array {
        return new Uint8Array(0);
    }
}

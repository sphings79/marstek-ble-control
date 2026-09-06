import { VenusPayload } from "./VenusPayload";

export interface BatteryModuleState {
    index: number;
    soc: number;
    status: number;
    temperature: number;
}

/** Fixed part before the per-module entries. */
const HEADER_LENGTH = 7;

/** Each entry: state of charge (u16 LE, tenths), status (u8), temperature (u16 LE, tenths). */
const ENTRY_LENGTH = 5;

export class BatteryModulesStatePayload extends VenusPayload {
    /** What the storage says is installed. May be more than it sent data for. */
    public moduleCount: number;
    public moduleStates: BatteryModuleState[];

    constructor(moduleCount: number, modules: BatteryModuleState[]) {
        super();
        this.moduleCount = moduleCount;
        this.moduleStates = modules;
    }

    /** Whether the storage reported more modules than it sent readings for. */
    public get isTruncated(): boolean {
        return this.moduleCount > this.moduleStates.length;
    }

    /**
     * The count and the data are read separately on purpose.
     *
     * A Venus D with seven packs answers with a 42-byte frame: seven bytes of header and then six
     * entries, while the count in the first byte reads seven. The response does not grow past six
     * - so trusting the count walked straight off the end of the buffer, the parse threw, and the
     * widget showed nothing at all rather than the six readings that did arrive.
     *
     * Observed frame (seven packs installed):
     *   73 2a 23 42 | 07 7f 01 24 02 b6 0a | de 03 01 42 01 | ...five more entries... | a2
     */
    static FROM_BYTES(bytes: Uint8Array): BatteryModulesStatePayload {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        const reported = view.getUint8(0);
        const available = Math.max(0, Math.floor((bytes.length - HEADER_LENGTH) / ENTRY_LENGTH));
        const present = Math.min(reported, available);

        const modules: BatteryModuleState[] = [];

        for (let i = 0; i < present; i++) {
            const offset = HEADER_LENGTH + i * ENTRY_LENGTH;

            modules.push({
                index: i + 1,
                soc: view.getUint16(offset, true) / 10,
                status: view.getUint8(offset + 2),
                temperature: view.getUint16(offset + 3, true) / 10,
            });
        }

        return new BatteryModulesStatePayload(reported, modules);
    }

    toBytes(): Uint8Array {
        return new Uint8Array();
    }
}

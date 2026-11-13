export interface DeviceInfo {
    modelName: string;
    id: string;
    rawName: string;
}

export const parseDeviceName = (name: string): DeviceInfo => {
    const info: DeviceInfo = {
        modelName: "Unknown Device",
        id: "Unknown",
        rawName: name
    };

    if (!name.startsWith("MST_")) {
        return info;
    }

    const parts = name.split("_");
    switch (parts[1]) {
        case "VNSA":
            info.modelName = "Venus A";
            break;
        case "VNSD":
            info.modelName = "Venus D";
            break;
        // Venus E 3.0 advertises as MST_VNSE3_xxxx (Control FW: AT+QBLENAME=MST_VNSE3_%c%c%c%c)
        // and reports dev type VNSE3-0.
        case "VNSE3":
            info.modelName = "Venus E 3.0";
            break;
        // Venus E v1/v2 (dev type HMG-50) advertises as MST_ACCP_xxxx (Control FW 158:
        // AT+QBLENAME=MST_ACCP_%c%c%c%c in FUN_08006ed0). It runs the older firmware line.
        case "ACCP":
            info.modelName = "Venus E 1/2";
            break;
    }

    if (parts[2]) {
        info.id = parts[2];
    }

    return info;
};

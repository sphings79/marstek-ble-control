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
    }

    if (parts[2]) {
        info.id = parts[2];
    }

    return info;
};

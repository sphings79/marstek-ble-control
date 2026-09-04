<div align="center">

<img src="docs/assets/banner.svg" alt="Marstek BLE Control — cloud-free Web Bluetooth control panel for Marstek Venus battery storage" width="100%">

# Marstek BLE Control — Venus A / D / E 3.0

**Set up and control a Marstek Venus storage from your browser, over Bluetooth. No app, no account, no cloud.**

[![Web Bluetooth](https://img.shields.io/badge/Web%20Bluetooth-Chrome%20%C2%B7%20Edge%20%C2%B7%20Bluefy-2E86FF.svg?style=flat-square)](#browser-support)
[![Marstek Venus](https://img.shields.io/badge/Marstek-Venus%20A%20%C2%B7%20D%20%C2%B7%20E%203.0-22C55E.svg?style=flat-square)](#supported-devices)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square)](LICENSE)
[![Cloud-free](https://img.shields.io/badge/cloud-not%20required-22C55E.svg?style=flat-square)](#what-stays-local)

**English** · [Deutsch](README.de.md)

### 👉 Use it right now, nothing to install: **https://sphings-dev.de/marstek/control/**

</div>

---

## What this is

A Marstek Venus battery normally expects you to go through the Marstek app and the Marstek cloud
to change anything about it. **Marstek BLE Control** takes that detour out: it is a single static
web page that talks to the battery **directly over Bluetooth Low Energy** using the browser's
[Web Bluetooth](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API) API.

Open the page, hit connect, pick your storage — you are talking to the device. Nothing is
installed, no account exists, and no data is sent anywhere: the page is served as static files and
every command goes straight from your browser to the battery.

This is a **fork and continued development of
[Hypfer/venuscontrol](https://github.com/Hypfer/venuscontrol)**, which targets the Venus A. All
credit for the original tool and the reverse-engineering groundwork goes to Hypfer. This fork adds
**Venus D and Venus E 3.0 support**, **OTA firmware updates** and a number of extra controls.

> **Unofficial project. Not affiliated with, endorsed by, or supported by Marstek.**
> "Marstek" and "Venus" are trademarks of their respective owner and are used here only to describe
> which hardware this tool talks to.

---

## How it fits together

<div align="center">
<img src="docs/assets/architecture.svg" alt="Marstek BLE Control architecture: browser talks to the Venus battery over Web Bluetooth, an emulated Shelly Pro 3EM feeds grid readings over UDP 1010, and Home Assistant reads the battery over Modbus TCP — the Marstek cloud is not involved" width="100%">
</div>

The interesting part is what is **not** in that picture. Running a Venus cloud-free needs three
things, and none of them is a Marstek service:

1. **A way to configure the battery** — that is Marstek BLE Control, over Bluetooth.
2. **A grid power source** — the battery wants a Shelly Pro 3EM. It is happy with anything on your
   LAN that answers its UDP broadcast (see [the Shelly trick](#the-shelly-trick) below).
3. **A way to monitor it** — Modbus TCP into Home Assistant or anything else that speaks Modbus.

---

## What's new in this fork

- ✅ **Marstek Venus D support** — tested on real hardware
- ✅ **Marstek Venus E 3.0 support** (`MST_VNSE3_*`) — own dashboard without PV/MPPT, without the
  multi-module battery view and without surplus feed-in, since its firmware implements none of
  them. Not yet tested on real hardware.
- 🔄 **OTA firmware updates over Bluetooth** — for Venus A, D and E 3.0; Control/EMS, BMS, MPPT and
  Micro-Inverter modules (VNS and BMS updates confirmed working by users on a Venus D). The
  firmware's own validation logic was verified to be identical across all three models.
- 🛡️ **Model detection for firmware files** — warns before flashing another model's image, based on
  the `VNSA`/`VNSD`/`VNSE` tag embedded in every image; verified against all 27 Venus images in the
  firmware archive
- ⚡ **Device Power Class** selection (800 / 2200 / 2500 W)
- 📉 **Peak Shaving** — cap grid draw at a configurable threshold
- 🎚️ **Self-Consumption Power Offset** — bias the controller to target a grid power other than 0 W
- 🔌 **Local API toggle** — enable the on-device UDP JSON-RPC API
- 🕐 **Set Time** on the device
- 🐛 Reliability fixes — correct BLE command IDs, and robust reassembly of fragmented BLE responses
  so Device Info and Work Mode load dependably

### Firmware updates over Bluetooth

<div align="center">
<img src="docs/assets/ota.svg" alt="The OTA firmware update panel: the firmware file is analysed and its model and component are checked against the connected device before the transfer starts" width="62%">
</div>

> This is an illustration of the panel, not a photograph of a running instance.

The firmware image is inspected **before** anything is sent: the model and the target component
are read out of the file and checked against the device you are connected to. A file for the wrong
model, or an MPPT image about to be sent as if it were Control/EMS firmware, is flagged rather
than flashed.

> ⚠️ **Firmware updates carry risk.** An interrupted or wrong flash can leave a module unusable.
> Keep the browser tab open and the device close by for the duration of the transfer.

---

## The app

<div align="center">
<img height="640" src="https://github.com/user-attachments/assets/4b7f0019-0526-41d0-9d26-fb07061e5b72" alt="Marstek BLE Control running on a phone: state of charge, battery and grid power, work mode and the other control widgets">
</div>

---

## Supported devices

| Device | BLE name | Status |
|---|---|---|
| Marstek Venus A | `MST_VNSA_xxxx` | Supported (from upstream), plus OTA and the extra controls |
| Marstek Venus D | `MST_VNSD_xxxx` | Supported — the focus of this fork, confirmed on real hardware |
| Marstek Venus E 3.0 | `MST_VNSE3_xxxx` | Supported, but not yet tested on real hardware |

Other Venus models fall back to a generic device view, which shows what can be read but does not
offer the model-specific controls.

---

## Browser support

Web Bluetooth is a browser feature, and not every browser ships it.

| Platform | Use |
|---|---|
| **Desktop** (Windows, macOS, Linux) | Chrome or Edge |
| **Android** | Chrome |
| **iOS / iPadOS** | **[Bluefy – Web BLE Browser](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)** (free) |

Safari and Chrome on iOS do **not** support Web Bluetooth — that is a restriction of iOS itself,
not of this tool. Bluefy brings its own engine and works. Open
**https://sphings-dev.de/marstek/control/** inside it.

---

## What it can do

Everything needed to run a storage cloud-free with an (emulated) Shelly Pro 3EM smart meter, plus
monitoring over Modbus TCP:

- **State** — state of charge, remaining energy, battery / grid / AC power, backup load, PV inputs,
  and energy history for today, this month and lifetime
- **Work mode** — including schedules with start/end time and charge/discharge power
- **Power limits** and **Device Power Class** (800 / 2200 / 2500 W)
- **Depth of discharge**
- **Peak shaving** with a configurable threshold
- **Self-consumption power offset**
- **CT / meter settings**
- **Local API** toggle (UDP JSON-RPC on the device)
- **Set time**, **device info**, **battery module state**, **factory reset**
- **OTA firmware updates**

Cloud features such as dynamic grid-price arbitrage are deliberately **out of scope** — those need
the vendor's service, which is exactly what this tool exists to avoid.

---

## The Shelly trick

You do not need uni-meter or anything comparable. All this battery wants from a Shelly Pro 3EM is
something on the subnet broadcast address listening on **UDP port 1010** that answers its
inquiries.

You do not even need to speak the Shelly protocol properly. During testing the firmware's JSON
parser turned out not to be a JSON parser at all, but roughly "find string offset, read int 2 bytes
later". So responding with this works:

```
a_act_power==${l1},b_act_power==${l2},c_act_power==${l3},total_act_power==${total}
```

You could also send it some prose:

```
Dearest Marstek,

I hope this UDP packet finds you well.
Today, the a_act_poweris${pA}watts.

However, the b_act_poweris${pB}watts, which is interesting.
And look at c_act_poweris${pC}watts!

In conclusion, the total_act_poweris${total}watts.

Sincerely,
The Shelly Emulator.
```

You probably shouldn't, but you could.

---

## What stays local

- The page is **static** — HTML, CSS and JavaScript, no backend, no API calls to anything.
- Bluetooth traffic goes **browser → battery** directly. It does not pass through a server.
- No account, no login, no telemetry, no analytics.
- Hosting it yourself is a matter of serving the built files from any web server; the hosted copy
  at sphings-dev.de is provided purely for convenience.

Web Bluetooth requires a secure context, so the page must be served over **HTTPS** (or from
`localhost`) — this is a browser rule, not a choice made here.

---

## Running it yourself

```bash
npm install
npm run dev      # development server
npm run build    # static files in dist/
```

The contents of `dist/` are the whole application. Drop them on any static web host that serves
HTTPS.

---

## FAQ

**Do I have to give up the Marstek app?**
No. Marstek BLE Control changes settings on the device; the app keeps working. The point is that you no
longer *need* the app or its cloud for the settings covered here.

**Does my battery have to be online for this?**
No — quite the opposite. Bluetooth is a direct radio link between your phone or laptop and the
battery. It works with the battery's WiFi disabled entirely.

**Why Bluetooth and not the local API?**
The on-device API has to be switched on first, and there is no way to do that except over
Bluetooth or via the cloud app. Marstek BLE Control has a toggle for it.

**Can I brick my battery with the OTA function?**
A failed firmware flash can leave a module in a bad state, as with any firmware update. The tool
checks the image against the connected device before it starts, but you carry the risk. Only flash
images you trust, and do not interrupt a running transfer.

**Is Venus E supported?**
Not specifically. Venus E v1/v2 runs on a different firmware base, so it falls back to the generic
device view.

---

## Related projects

- 🌐 **More projects and tools:** [sphings-dev.de](https://sphings-dev.de/)
- 📦 **Firmware archive for Marstek Venus devices:** [sphings79/marstek-firmware-archiv](https://github.com/sphings79/marstek-firmware-archiv)
- 🛡️ **Firmware backup / checker tool:** [marstek-fw-checker](https://sphings-dev.de/marstek/marstek-fw-checker/) — grab a copy of a firmware image and contribute it to the archive. Note: firmware can only be backed up while it is still pending, i.e. **before it has been installed** — once flashed, it can no longer be extracted.
- 🔬 **Venus D firmware reverse engineering:** [sphings79/Marstek-Venus-D-Firmware-Reverse-Engineering](https://github.com/sphings79/Marstek-Venus-D-Firmware-Reverse-Engineering)
- 🏠 **Home Assistant integration over Modbus:** [sphings79/marstek_venus_modbus_dev](https://github.com/sphings79/marstek_venus_modbus_dev)

## Credits

- Original tool: **[Hypfer/venuscontrol](https://github.com/Hypfer/venuscontrol)**
- Firmware archive and reverse-engineering references: [rweijnen/marstek-firmware-archive](https://github.com/rweijnen/marstek-firmware-archive) · [rweijnen/marstek-venus-monitor](https://github.com/rweijnen/marstek-venus-monitor)

## ⭐ Found it useful?

If this helped you get your storage off the cloud, a **star** on the repository is genuinely
appreciated — it helps other Venus owners find it. Thanks!

---

## Sponsor this project

These tools are built and maintained in my free time, and they stay free, open and cloud-free.
If one of them saved you an afternoon, you can [buy me a coffee](https://buymeacoffee.com/sphings).

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-sphings-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000)](https://buymeacoffee.com/sphings)

## License

Apache License 2.0 — see [LICENSE](LICENSE).

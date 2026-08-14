# Venuscontrol — Venus D Edition

<img height="700" src="https://github.com/user-attachments/assets/4b7f0019-0526-41d0-9d26-fb07061e5b72" />

A browser-based, **cloud-free** control panel for Marstek Venus storages. It talks to the battery
directly over Bluetooth (Web Bluetooth) — no app, no account, no cloud.

This is a **fork and continued development of [Hypfer/venuscontrol](https://github.com/Hypfer/venuscontrol)**,
which targets the Venus A. All credit for the original tool and the reverse-engineering groundwork
goes to Hypfer. This fork extends it with **full Marstek Venus D support (confirmed on real
hardware)**, **OTA firmware updates**, and a number of additional controls.

> ### 👉 Use it right now — no install: **https://sphings-dev.de/marstek/control/**

## 📱 iOS / iPadOS

Safari and Chrome on iOS do **not** support Web Bluetooth. Use the free
**[Bluefy – Web BLE Browser](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)**
from the App Store, then open **https://sphings-dev.de/marstek/control/** inside Bluefy.

On **Android** use Chrome, on **desktop** use Chrome or Edge.

## ✨ What's new in this fork

- ✅ **Marstek Venus D support** — tested on real hardware
- 🔄 **OTA firmware updates over Bluetooth** — Control/EMS, BMS, MPPT and Micro-Inverter modules
  (VNS and BMS updates confirmed working by users)
- ⚡ **Device Power Class** selection (800 / 2200 / 2500 W)
- 📉 **Peak Shaving** — cap grid draw at a configurable threshold
- 🎚️ **Self-Consumption Power Offset** — bias the controller to target a grid power other than 0 W
- 🔌 **Local API toggle** — enable the on-device UDP JSON-RPC API
- 🕐 **Set Time** on the device
- 🐛 Reliability fixes — correct BLE command IDs, robust reassembly of fragmented BLE responses so
  Device Info and Work Mode load dependably

## What can it do?

Everything required to set a storage up for cloud-free usage with an (emulated) Shelly Pro 3EM
smart meter + monitoring via Modbus TCP.<br/>
Cloud stuff like dynamic grid-pricing arbitrage is out of scope.

### Additional funfact:
You don't need uni-meter or similar. All this battery wants for a Shelly Pro 3EM is something that
listens to the subnet broadcast address on UDP Port 1010 and replies to its inquiries.

You also don't need to actually speak the Shelly protocol. At least during testing, the FW JSON
parser was not actually a JSON parser but just "find string offset, read int 2 bytes later".
Therefore, responding with this works:<br/>
`a_act_power==${l1},b_act_power==${l2},c_act_power==${l3},total_act_power==${total}`

You could also send it some prose like
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

## Related projects

- 🌐 **More of my projects & tools:** [sphings-dev.de](https://sphings-dev.de/)
- 📦 **Firmware archive for Marstek Venus devices:** [sphings79/marstek-firmware-archiv](https://github.com/sphings79/marstek-firmware-archiv)
- 🔬 **Venus D firmware reverse engineering:** [sphings79/Marstek-Venus-D-Firmware-Reverse-Engineering](https://github.com/sphings79/Marstek-Venus-D-Firmware-Reverse-Engineering)

## Credits

- Original tool: **[Hypfer/venuscontrol](https://github.com/Hypfer/venuscontrol)**
- Firmware archive & reverse-engineering references: [rweijnen/marstek-firmware-archive](https://github.com/rweijnen/marstek-firmware-archive) · [rweijnen/marstek-venus-monitor](https://github.com/rweijnen/marstek-venus-monitor)

## ⭐ Found it useful?

If this helped you get your storage off the cloud, I'd genuinely appreciate a **star** on the
repo — it helps other Venus owners find it. Thanks!

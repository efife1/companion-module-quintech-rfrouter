# Quintech RF Router — Bitfocus Companion Module

Version 1.2.0

Bitfocus Companion module for controlling a **Quintech 16x1 RF Router** over TCP/IP (port 9100). Button feedback follows the switch's **actual** active input, including changes made on the front panel.

## Features

- Select RF inputs 1–16 (8-byte binary frames from Quintech's integration sheet, `docs/Quintech Integration.pdf`)
- 16 ready-made presets (*RF Inputs*), each with button feedback
- **Feedback from the switch itself:**
  - selections show amber while pending, then green once the switch ACKs them;
  - the module polls the switch with the Quintech `Q` status query (default every 2 s), so front-panel changes and other controllers are reflected too;
  - the active input is read on connect, so buttons are right even after Companion restarts.
- Rejected commands (NAK) and missing replies are logged, and the button does not light
- Variables: `current_input`, `current_input_number`, `selection_status`, `switch_status_raw`, `last_ack_latency_ms`, `last_command_hex`
- *Query Switch Status* and *Send Raw Hex Command* actions
- Optional debug logging of every TX/RX frame
- Module API 1.14 (Companion 4.2+). Tested on **Companion 5.1.3, Windows**, against a live switch.

## Protocol summary

All frames are `STX "FF" <cmd> [data] ETX CHK`, where CHK is the XOR of every byte through ETX.

| Purpose | Sent | Reply |
|---|---|---|
| Select input 7 | `02 46 46 53 30 37 03 55` | `06 46 46 53 03 56` (ACK, 58–99 ms) |
| Query active input | `02 46 46 51 03 50` | `06 46 46 51 30 30 37 03 63` = "007" (11–60 ms) |
| Rejected command | — | NAK `15 …` |

The switch never sends anything on its own when its input changes, which is why the module polls. Full analysis with decoded packet captures: [`docs/QUINTECH-FEEDBACK-PROTOCOL-NOTES.md`](docs/QUINTECH-FEEDBACK-PROTOCOL-NOTES.md). The raw captures are in [`captures/`](captures/).

## Install (Companion Developer Mode, no Node needed on the target PC)

1. Download `companion-module-quintech-rfrouter-1.2.0-win.zip` from the [v1.2.0 release](https://github.com/efife1/companion-module-quintech-rfrouter/releases/tag/v1.2.0). It already includes its runtime dependencies.
2. Extract it so you have `<folder>\companion-module-quintech-rfrouter\companion\manifest.json`.
3. In the Companion launcher, open the cog → **Developer**, enable **Developer Modules**, and set the path to `<folder>`, the **parent** of the module folder.
4. Restart Companion if needed, then add a **Quintech RF Router** connection with the switch's IP and port 9100.
5. Drag buttons from **Presets → RF Inputs**, or add the *Input is selected (confirmed by switch)* feedback to your own buttons.

Keep only one copy of module id `quintech-rfrouter` in the developer folder.

## Configuration

| Field | Default | Notes |
|---|---|---|
| Quintech Switch IP Address / Hostname | — | |
| Quintech TCP Port | 9100 | |
| Connect at startup | on | |
| Debug logging | off | |
| Feedback source | Switch ACK | *Command sent* gives the v1.0.0 behaviour |
| ACK timeout (ms) | 1000 | |
| Query switch status on connect | on | |
| Status poll interval (ms, 0 = off) | 2000 | |

The config IDs from v1.0.0 (`host`, `port`, `connectAtStartup`, `debug`) are unchanged, so existing connections keep their settings.

## Build from source

```bash
npm ci
npm run build   # tsc -> dist/
npm test        # wire format, ACK feedback, status polling (mock switch, no hardware)
```

Node 22 is required for development. A deployment zip is a clean copy of `companion/`, `dist/`, `package.json` and `package-lock.json` with `npm ci --omit=dev` run inside it.

## Testing without hardware

`tools/mock-router.js` behaves like the real switch. It ACKs selects and answers `Q` with its current input. Type a number from 1 to 16 and press Enter in its window to simulate a front-panel change.

```bash
node tools/mock-router.js            # 127.0.0.1:9100
node tools/mock-router.js --no-ack   # test the "No ACK" path
```

On Windows, `tools/run-mock-router.cmd` runs it with the Node 22 runtime bundled with Companion. Point the connection at `127.0.0.1`.

## Repository layout

| Path | Contents |
|---|---|
| `src/`, `dist/` | TypeScript source and compiled CommonJS output that Companion runs |
| `companion/` | `manifest.json`, `HELP.md` |
| `tests/` | Mock-switch test suites (`npm test`) |
| `tools/` | Mock router for bench testing |
| `docs/` | Protocol notes, build/test record, Quintech integration sheet, Windows handoff notes |
| `captures/` | Wireshark captures from the live switch (2026-11-25) |

See [`CHANGELOG.md`](CHANGELOG.md) for version history.

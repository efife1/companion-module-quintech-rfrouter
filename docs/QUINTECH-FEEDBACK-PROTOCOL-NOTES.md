# Quintech RF Router — feedback protocol notes (from packet captures)

> The three capture files referenced below are in [`captures/`](../captures/) in this repository.
>
> **Summary:** the switch never pushes state changes on its own. Its active input is read with the documented **Q status query** `02 46 46 51 03 50`, and it replies `06 46 46 51 <3 ASCII digits> 03 CHK`. This was verified on 192.168.40.243 (capture 3). Module v1.2.0 polls this query, so front-panel changes now light the correct button.

## Capture 1: Companion selects + one front-panel change

**Capture file:** `C:\CompanionDev\quintech-feedback-capture-2026-11-25.pcapng` (428 packets, 206.7 s, Wireshark 4.6.10, capture filter `host 192.168.40.243`)
**Date:** 2026-11-25, 08:50–08:54 PST
**Companion host:** 192.168.40.10 (DESKTOP-GU02RF1, Companion 5.1.3, Quintech module v1.0.0)
**Switch:** 192.168.40.243, TCP port 9100

## What was done during the capture
1. Companion's persistent connection was already open (client port 63215 → 9100).
2. In Companion, Input 1, Input 2, Input 1 and Input 2 were pressed about 2 s apart.
3. The input was changed to **16 on the switch's front panel**. Nothing was sent from Companion for this change.

## Decoded traffic (data packets only)

| Frame | Time (s) | Direction | Bytes | Meaning |
|---|---|---|---|---|
| 171 | 84.667 | Companion → switch | `02 46 46 53 30 31 03 53` | Select 1 |
| 173 | 84.726 (+58 ms) | switch → Companion | `06 46 46 53 03 56` | ACK |
| 179 | 86.789 | Companion → switch | `02 46 46 53 30 32 03 50` | Select 2 |
| 181 | 86.853 (+63 ms) | switch → Companion | `06 46 46 53 03 56` | ACK |
| 185 | 88.649 | Companion → switch | `02 46 46 53 30 31 03 53` | Select 1 |
| 187 | 88.749 (+99 ms) | switch → Companion | `06 46 46 53 03 56` | ACK |
| 191 | 90.529 | Companion → switch | `02 46 46 53 30 32 03 50` | Select 2 |
| 193 | 90.629 (+98 ms) | switch → Companion | `06 46 46 53 03 56` | ACK |

Everything else in the file is one TCP keep-alive per second each way (frames from the switch carry no data).

**Front-panel change to input 16: no packets from the switch.** From the switch, there were 203 frames with no data and 8 six-byte ACKs, nothing else.

## Capture 2: all traffic from the switch's MAC, front-panel changes only

**File:** `C:\CompanionDev\quintech-frontpanel-mac-capture-2026-11-25.pcapng` (448 packets, 09:06:53–09:10:32 PST, 218 s)
**Capture filter:** `ether host 00:01:c0:30:31:f3`, the switch's MAC (CompuLab OUI). This includes broadcast, multicast, UDP and non-IP frames sent by the switch.
**Companion:** module v1.1.0 connected (client port 63339 → 9100). No buttons were pressed.

The user changed inputs several times on the **front panel**, including a change to **port 7 at about 09:10**, which falls inside the capture.

| Count | From | What |
|---|---|---|
| 217 | Companion → switch | TCP keep-alive (1-byte probe, about 1 s apart) |
| 217 | switch → Companion | TCP keep-alive ACK, no data |
| 7 | switch → broadcast | ARP "who has 192.168.40.10" (about every 30 s, routine) |
| 7 | Companion → switch | ARP reply |
| **0** | switch → anyone | **any data, UDP, multicast or broadcast message** |

**Result: the switch sent nothing when its input changed on the front panel.** No data reached this PC on the open TCP 9100 connection, and none went out by broadcast or multicast.

What this capture cannot rule out:
- Unicast traffic from the switch to a **different IP address**, such as Quintech control software on another PC or a configured notification address. On a switched network, this PC never sees that traffic.
- Feedback on the switch's **serial port**.
- A **status query** command that has to be sent before the switch reports its state.
- State shown in the switch's **web interface**, if it has one.

## Capture 3: Q status query (module v1.2.0-beta.1)

**File:** `C:\CompanionDev\quintech-status-query-capture-2026-11-25.pcapng` (944 packets, 09:16:07–09:22:20 PST, filter `ether host 00:01:c0:30:31:f3`)
**Source of the command:** the Quintech SRR 1000/16x1 operating manual (protocol 1.21). It documents an STX/ETX wrapper, ACK `0x06` / NAK `0x15`, and a **Q** query (`02 ADR ADR 51 03 CHK`) whose response "contains three ASCII data bytes". The related SRX manual also lists "O: Query Output Channel". The full PDFs could not be fetched automatically; the details come from search-engine excerpts of satcomsource.com/SRR-1000-Operations-Manual.pdf and manualzz.com (SRX 2150 manual).

| Time | Event | Bytes | Meaning |
|---|---|---|---|
| 09:18:42.917 | Module connects, sends query | `02 46 46 51 03 50` | STX "FFQ" ETX CHK |
| 09:18:42.941 | Switch replies (+24 ms) | `06 46 46 51 30 30 37 03 63` | ACK "FFQ" **"007"**, input 7 (previous front-panel setting) |
| 09:19:21.121 | After a front-panel change to 1 | `06 46 46 51 30 30 31 03 65` | **"001"**, input 1. Button 1 turned green in Companion. |
| 09:21:48.761 | User presses button 2 in Companion | `02 46 46 53 30 32 03 50` | Select 2 |
| 09:21:48.844 | Switch (+83 ms) | `06 46 46 53 03 56` | ACK for the select |
| 09:21:50.051 | Next poll | `06 46 46 51 30 30 32 03 66` | **"002"**, input 2 |

- 109 queries were sent and 109 replies received, with 11 / 25 / 60 ms latency (min / avg / max). There were no NAKs, timeouts or unexpected frames.
- All checksums are valid (XOR of all bytes through ETX).
- The user confirmed in Companion that button 1 lit after the front-panel change and button 2 lit after pressing it.

### Status reply format

| Byte | Value |
|---|---|
| 0 | `06` ACK |
| 1–2 | `46 46` address "FF" |
| 3 | `51` "Q" |
| 4–6 | three ASCII digits, the active input `001`–`016` |
| 7 | `03` ETX |
| 8 | checksum (XOR of bytes 0–7) |

## Frame format

| Byte | Command (8 bytes) | ACK reply (6 bytes) |
|---|---|---|
| 0 | `02` SOH/STX | `06` ACK |
| 1–2 | `46 46` address "FF" | `46 46` address "FF" |
| 3 | `53` function "S" (select) | `53` function "S" echoed |
| 4–5 | two ASCII digits, the selection `01`–`16` | — |
| next | `03` EOH/ETX | `03` ETX |
| last | checksum | checksum |

**Checksum = XOR of every byte from the first byte through ETX.** This holds for all 16 command frames in the PDF and for the ACK:
- `02^46^46^53^30^31^03 = 53` (Select 1)
- `06^46^46^53^03 = 56` (ACK)

## Conclusions for feedback
1. **Selects are ACKed** (`06 46 46 53 03 56`, 58–99 ms later). The ACK does not carry the port; the module matches it by command letter, oldest first.
2. **The switch never announces changes on its own.** Captures 1 and 2 show nothing at all on front-panel changes, including all broadcast and multicast traffic from its MAC.
3. **The Q status query returns the active input** (capture 3). It is answered in 11–60 ms, so polling every 2 s is light, and a front-panel change is shown within one poll interval.
4. **NAK = `0x15`** for rejected commands, per the Quintech manual. It was not observed in these captures.
5. The SRX manual's **"O" (query output)** and **"C" (check change flag)** commands were not needed and were **not** sent to the hardware.

## How v1.2.0 uses this
- On connect the module sends Q immediately, so the active input is known even after a Companion restart. After that it polls every `statusPollMs` (default 2000 ms; 0 turns polling off).
- A Q reply with a value from 1 to 16 sets the selected input and lights that button (status "Confirmed (switch status)"). A reply it doesn't understand is logged once and ignored.
- Selects show **pending** (amber), then **confirmed** (green) on their ACK. A NAK or missing ACK is logged, and the button does not light.
- Polls are skipped while a command is waiting for its reply, so a stale status can't override a selection in progress.

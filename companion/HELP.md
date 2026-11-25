# Quintech RF Router

Version 1.2.0

## Overview

Controls a Quintech 16x1 RF Router over TCP/IP, with button feedback that follows the switch's **actual** active input, including changes made on the front panel.

## Configuration

- **Quintech Switch IP Address / Hostname**
- **Quintech TCP Port** (default 9100)
- **Connect at startup** (default on)
- **Debug logging** (default off): logs every TX/RX frame, ACK latency and status replies
- **Feedback source** (default *Switch ACK*): *Command sent* gives the v1.0.0 behaviour
- **ACK timeout (ms)** (default 1000)
- **Query switch status on connect** (default on)
- **Status poll interval (ms, 0 = off)** (default 2000): how often the module asks the switch which input is active. On the tested unit a reply takes 11–60 ms.

## How feedback works

1. When you press a button, it shows **amber** (pending). It turns **green** when the switch ACKs (`06 46 46 53 03 56`).
2. The module also sends the Quintech status query `02 46 46 51 03 50` on connect and at every poll interval. The switch answers with its active input, e.g. `06 46 46 51 30 30 37 03 63` = input 7. A change made on the front panel or by another controller shows up within one poll interval.
3. If the switch rejects a command (NAK `0x15`) or doesn't answer in time, a warning is logged and the button does not light.

## Actions

- **Select RF Input**: inputs 1–16
- **Query Switch Status**: asks the switch for its active input now
- **Send Raw Hex Command**: if the bytes match one of the 16 route commands, feedback follows it too

## Feedbacks

- **Input is selected (confirmed by switch)**: default green
- **Input selection is pending**: default amber

## Presets

There are 16 presets under *RF Inputs*, each with both feedbacks.

## Variables

| Variable | Meaning |
|---|---|
| `current_input` / `current_input_number` | Active input as reported or confirmed by the switch |
| `selection_status` | Confirmed / Confirmed (switch status) / Pending (Input n) / No ACK (Input n) / Rejected (Input n) / Unknown |
| `last_ack_latency_ms` | Time from select to ACK |
| `switch_status_raw` | Raw data of the last status reply, e.g. `007` |
| `last_command_hex` | Last command bytes sent (status polls are not included) |

## Notes

- The status query and reply format come from Quintech's SRR 16x1 protocol documentation and were verified against this switch on 2026-11-25.
- If a switch doesn't answer the status query, the module logs one warning and falls back to ACK-only feedback.

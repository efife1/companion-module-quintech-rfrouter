# Changelog

## 1.2.0 — 2026-11-25

- **Status polling.** The module sends the Quintech `Q` status query (`02 46 46 51 03 50`) on connect and every 2 s (configurable; 0 = off). The switch replies with its active input, so feedback now follows front-panel changes and other controllers.
- Replies are matched to commands by command letter. NAK (`0x15`) is handled and shown as *Rejected (Input n)*.
- New *Query Switch Status* action, new `switch_status_raw` variable, and new config fields `statusQueryAtConnect` and `statusPollMs`.
- `repository` and `bugs` added to the manifest and `package.json`.
- Repository cleanup: removed the committed `node_modules/`, the duplicate nested module folder and `.DS_Store`. Added `.gitignore`, tests, mock router, docs and captures.
- Verified on a live switch (192.168.40.243) with Companion 5.1.3 on Windows: 109 of 109 status queries answered, and front-panel changes were shown on Companion buttons.

## 1.1.0 — 2026-11-25 (not released separately)

- Button feedback: *Input is selected (confirmed by switch)* (green) and *Input selection is pending* (amber), added to all 16 presets.
- A selection is confirmed by the switch's ACK (`06 46 46 53 03 56`) instead of by the socket write. *Feedback source* = *Command sent* restores the old behaviour.
- New config field `ackTimeoutMs`, and new variables `selection_status` and `last_ack_latency_ms`.

## 1.0.0

- Initial release: select inputs 1–16 over a persistent TCP connection, a raw hex action, 16 presets, debug logging.

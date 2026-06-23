# Quintech RF Router

**Build ID: FIX12-BUILD-CLEAN**  
**Module version: 0.1.12-fix12-build-clean**  
**Companion target: v4.2.3 / @companion-module/base 1.14**

Controls a Quintech 16x1 RF router over TCP.

## Configuration Fields Expected in Edit Connection

If this build is loaded correctly, the Edit Connection page should show:

- Quintech Switch IP Address / Hostname
- Quintech TCP Port, default 9100
- Connect at startup
- Debug logging

## Commands

Presets/actions are provided for RF inputs/outputs 1 through 16 using the Quintech integration document command table.

## Lab Notes

This build rolls back to the stable persistent-TCP behavior and removes the experimental per-command and FIN-close logic.


## Fix11 Notes
This build changes presets and variables to the Companion v4.2.3 / module-base 1.14 object format so the module process stays running and the Edit Connection config fields can load.

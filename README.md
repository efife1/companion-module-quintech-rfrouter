# Quintech RF Router Companion Module

Bitfocus Companion v4.2.3 developer module for a Quintech 16x1 RF router.

This version is modeled after Generic TCP/UDP behavior:

- Host/IP and TCP port fields are shown in Edit Connection
- Default TCP port: 9100
- Persistent TCP connection mode, similar to Generic TCP/UDP
- Optional per-command TCP mode
- `setNoDelay(true)` enabled
- Fast reconnect option
- Presets for outputs 1-16

## Install

```bash
rm -rf ~/CompanionModules/companion-module-quintech-rfrouter
mkdir -p ~/CompanionModules
cd ~/CompanionModules
unzip ~/Downloads/companion-module-quintech-rfrouter-v423-fix8-generic-tcp-style.zip
cd companion-module-quintech-rfrouter
rm -rf node_modules package-lock.json
npm config set registry https://registry.npmjs.org/
npm install
npm run build
```

Restart Companion after building.

## Recommended settings

- TCP Connection Mode: Persistent TCP connection, like Generic TCP/UDP
- Connect / Send Timeout: 750 ms
- Reconnect Interval: 500 ms
- Debug logging: Off unless troubleshooting

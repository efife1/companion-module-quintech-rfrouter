# Quintech RF Router — Windows development handoff

## Objective
Continue the existing v1.0.0 module on Windows using Claude Code and Bitfocus Companion 5.1.0 Developer Mode. Prefer a ready-to-extract runtime package with dependencies included, so the deployment PC needs no separate Node installation or build. Development may use Node and npm. Preserve the known-good baseline and module identity; do not publish or move tags without explicit approval.

## Provenance and status
The included module is extracted unchanged from the recovered original v1.0.0 ZIP. The user reported successful operation on Mac with Companion 4.2.3. Windows/5.1.0 has not been validated. GitHub: https://github.com/efife1/companion-module-quintech-rfrouter.git (remote contents not checked). Earlier attempts to clone into an existing directory failed and the live module lacked .git. Clone into a separate empty directory and compare before merging. Do not delete the working folder or force-push tags. The original manifest and package have empty repository fields; update only if appropriate.

## Existing implementation
- TypeScript source in src/, compiled CommonJS JavaScript in dist/, manifest and HELP.md in companion/.
- package.json: version 1.0.0, @companion-module/base ~1.14.0, TypeScript ^5.4.0, Node >=22, build `tsc -p tsconfig.build.json`.
- Manifest id quintech-rfrouter; runtime node22, nodejs-ipc, API 1.14.0, entrypoint ../dist/main.js.
- Config IDs host, port (9100), connectAtStartup (true), debug (false). Preserve IDs for existing configurations.
- Actions select_input (1–16), raw_hex; 16 presets input_1 through input_16. Variables current_input, current_input_number, last_command_hex. Current input is inferred from successful socket write, NOT confirmed hardware state. No actual routing feedback implemented.
- main.ts uses persistent node:net TCP socket, TCP_NODELAY, keepalive, 3-second connection timeout, 1-second reconnect delay, raw binary Buffer writes, optional RX/TX debug logging. Preserve behavior until testing justifies changes. Previous iterations investigated per-command connections and latency; do not assume those are the final implementation.
- runEntrypoint(QuintechRfRouterInstance, []) is present. Running dist/main.js directly outside Companion can fail because MODULE_MANIFEST is absent; use Companion to test initialization.

## Protocol reference
Original user-provided PDF is reference/Quintech Integration.pdf. It calls the selections outputs; module UI calls them inputs. Send exactly eight binary bytes per selection, not ASCII hex or percent strings. Do not invent query/ACK protocol.

| Selection | Hex bytes |
|---|---|
| 1 | `02 46 46 53 30 31 03 53` |
| 2 | `02 46 46 53 30 32 03 50` |
| 3 | `02 46 46 53 30 33 03 51` |
| 4 | `02 46 46 53 30 34 03 56` |
| 5 | `02 46 46 53 30 35 03 57` |
| 6 | `02 46 46 53 30 36 03 54` |
| 7 | `02 46 46 53 30 37 03 55` |
| 8 | `02 46 46 53 30 38 03 5A` |
| 9 | `02 46 46 53 30 39 03 5B` |
| 10 | `02 46 46 53 31 30 03 53` |
| 11 | `02 46 46 53 31 31 03 52` |
| 12 | `02 46 46 53 31 32 03 51` |
| 13 | `02 46 46 53 31 33 03 50` |
| 14 | `02 46 46 53 31 34 03 57` |
| 15 | `02 46 46 53 31 35 03 56` |
| 16 | `02 46 46 53 31 36 03 55` |

## First tasks for Claude
1. Inspect local source and installed Companion version. Verify 5.1.0 module API/runtime requirements against official Bitfocus documentation and matching release source (https://github.com/bitfocus/companion and https://github.com/bitfocus/companion-module-base). Do not blindly upgrade dependencies or manifest.
2. In PowerShell, from companion-module-quintech-rfrouter, run `node --version`, `npm --version`, `npm install`, `npm run build`. Capture errors; retain a lockfile after successful install. Use a Node version supported by the target runtime. If PowerShell blocks npm.ps1, use npm.cmd.
3. Test compiled command mapping against the PDF. Run a local TCP mock server on 127.0.0.1:9100 (or unused alternate port), verify all 16 eight-byte frames, ordering, reconnect, and debug logs. Never send test traffic to live broadcast hardware without approval.
4. In Companion Developer Mode point to the parent folder containing the module, restart, add connection, verify config fields, actions, presets and variables. Inspect Companion logs if module fails to load. Avoid duplicate module IDs in developer directory.
5. Review potential issues separately: first send before socket connects, raw-hex parser silently strips nonhex characters, status/variables reflect write not hardware ACK. Do not change protocol or transport semantics without tests.
6. Produce a Windows deployment ZIP containing module folder, companion/, dist/, package.json, lockfile and production dependencies. Use a clean staging copy and npm ci --omit=dev after a lockfile exists; verify no missing or platform-incompatible native dependencies. Test extraction and loading in Companion 5.1.0. Document exact build and deployment steps and any remaining limitations. Keep version 1.0.0 as baseline; ask before assigning a new release version.

## Acceptance criteria
Build succeeds; module loads in Companion 5.1.0 on Windows; config fields appear; 16 presets and both actions work; mock receives exact frames; reconnect and logging work; hardware switching and latency are verified separately by user; deployment ZIP loads without npm on target PC if feasible. Report actual test results, not assumptions.

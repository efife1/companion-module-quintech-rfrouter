# Build and test results

## Environment
- Built in a Linux workspace with Node 22.23 and npm 10.9. `@companion-module/base` 1.14.1 (from `~1.14.0`), no native dependencies.
- Deployed to Windows (DESKTOP-GU02RF1) running **Companion 5.1.3**, which ships the node18, node22 and node26 runtimes. Module API 1.x remains fully supported in Companion 5.x.
- Live switch: Quintech 16x1 at 192.168.40.243, TCP 9100.

## v1.2.0
- `npm test` passes all three suites:
  - wire-test: 17 checks;
  - ack-feedback-test: 34 checks;
  - status-poll-test: 18 checks.
  They passed on both the build and the production staging copy (`npm ci --omit=dev`).
- Live verification (capture `captures/quintech-status-query-capture-2026-11-25.pcapng`):
  - the switch answered the Q query on connect with "007" (its front-panel state);
  - after a front-panel change to 1 it answered "001", and button 1 lit in Companion;
  - after a Companion press of 2, the select was ACKed in 83 ms, the next poll answered "002", and button 2 lit;
  - 109 of 109 queries were answered, in 11–60 ms.

## v1.1.0
- The ACK-based feedback design came from capture 1. Two captures, including all traffic from the switch's MAC, proved that the switch never announces changes on its own. That led to v1.2.0's polling.

## v1.0.0 baseline
- Rebuilt from source. `dist/*.js` is byte-identical to the original v1.0.0 release.
- Mock router test: all 16 frames byte-exact and in order; reconnect and logging work. Confirmed working with the real switch on Windows.

## Deployment on the test PC
- Each version was extracted next to the others in `C:\CompanionDev\companion-module-quintech-rfrouter-<version>-win\`.
- The Companion Developer Modules Path points at the active version's folder. To roll back, point it at an older folder.

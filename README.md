# Quintech RF Router Companion Module

Version 1.0.0

## Description

Bitfocus Companion module for controlling a Quintech 16x1 RF Router over TCP/IP.

## Features

- TCP/IP control
- User-configurable router IP address or hostname
- User-configurable TCP port
- Actions for inputs 1 through 16
- Presets for inputs 1 through 16
- Optional debug logging
- Companion v4.2.3 compatibility

## Default Connection Settings

- TCP Port: 9100

## Installation

1. Enable Developer Modules in Companion.
2. Set the Developer Modules Path to the parent folder that contains this module folder.
3. Install this folder as `companion-module-quintech-rfrouter`.
4. Run `npm install`.
5. Run `npm run build`.
6. Fully restart Companion.
7. Add a new Quintech RF Router connection.
8. Enter the Quintech router IP address and TCP port.

## Build Commands

```bash
rm -rf node_modules package-lock.json
npm config set registry https://registry.npmjs.org/
npm install
npm run build
```

## Release

Version 1.0.0 is the initial stable release.

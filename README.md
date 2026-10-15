# Simple ADB tools

**Install APKs and handle everyday adb work without a terminal.** A desktop app for Windows and macOS by [Hejzlar Development](https://hejzlar-development.cz).

[![CI](https://github.com/cheetumen52/simple-adb-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/cheetumen52/simple-adb-tools/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cheetumen52/simple-adb-tools)](https://github.com/cheetumen52/simple-adb-tools/releases/latest)
[![License](https://img.shields.io/github/license/cheetumen52/simple-adb-tools)](LICENSE)

## Supported languages

| Language | App | Installer (Windows) | Changelog |
|---|---|---|---|
| English | ✅ | ✅ | [CHANGELOG.en.md](CHANGELOG.en.md) |
| Czech (čeština) | ✅ | ✅ | [CHANGELOG.md](CHANGELOG.md) |

The app follows the system language (Slovak systems get Czech, everything else falls back to English). Switch it any time in **Settings → App language**.

## Features

- **APK installation**: drag and drop into the window, "Open with" from Finder/Explorer, or pick from watched folders. An install queue, a comparison against the version on the phone, plain-language error explanations with a one-click reinstall, and optional auto-install of new builds from Downloads.
- **Quick app controls**: the last app you installed and the 10 most recently installed apps on the device. Launch, restart, logcat, clear data, uninstall.
- **ADB toolset**: device overview, screen mirroring via [scrcpy](https://github.com/Genymobile/scrcpy), app management (including pulling APKs off the phone), live logcat, screenshots and screen recording, remote buttons, deep links, developer toggles and a shell.
- **Wi‑Fi debugging**: switch a phone to Wi‑Fi in one click, pair Android 11+ devices, and reconnect automatically when the connection drops.
- **No SDK required**: the app can download adb, aapt2 and scrcpy from their official sources.
- **Automatic updates**, signed with the project key.
- **English and Czech**, following the system language or your choice in Settings.

## Download

Get the latest version from [Releases](https://github.com/cheetumen52/simple-adb-tools/releases/latest).

| System | File |
|---|---|
| Windows 10/11 | `Simple.ADB.tools_<version>_x64-setup.exe` (recommended) or `.msi` |
| macOS, Apple Silicon (M1 and newer) | `Simple.ADB.tools_<version>_aarch64.dmg` |
| macOS, Intel | `Simple.ADB.tools_<version>_x64.dmg` |

The app is not signed with a paid certificate yet:

- **Windows**: SmartScreen warns on first launch → *More info* → *Run anyway*.
- **macOS**: after the first launch go to *System Settings → Privacy & Security → Open Anyway*. Allow *Local Network* access for Wi‑Fi debugging.

## Phone setup

1. *Settings → About phone* → tap *Build number* 7 times.
2. In *Developer options* enable *USB debugging* (Xiaomi and Huawei also need *Install via USB*).
3. Connect the phone with a cable and confirm *Allow USB debugging*.

Windows may need the phone manufacturer's USB driver.

## Development

Requirements: Node.js 22, Rust (stable, via [rustup](https://rustup.rs)), Python 3 and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
cd tauri
npm install        # also enables the pre-commit hook
npm run tauri dev
```

| Command (in `tauri/`) | What it does |
|---|---|
| `npm run tauri dev` | Runs the app with hot reload |
| `npm test` | Frontend unit tests (Vitest) |
| `npm run typecheck` | TypeScript type check |
| `cd src-tauri && cargo test` | Rust backend unit tests |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | Rust lint |
| `npm run tauri build` | Production build for the current OS |

### Secret scanning

A pre-commit hook (`.githooks/pre-commit`) blocks commits that contain private keys (including the updater signing key), API tokens, hard-coded passwords, `.env` files or keystores. `npm install` turns it on via `core.hooksPath`; to enable it manually run `git config core.hooksPath .githooks`. CI runs the same scanner on the whole repository and on the bundled frontend. Mark a false positive with `secret-scan: allow` on that line.

```bash
python3 scripts/check-secrets.py --all   # scan every tracked file
```

Architecture and the release process are documented in [`docs/`](docs/); version history is in [`CHANGELOG.en.md`](CHANGELOG.en.md) (English) and [`CHANGELOG.md`](CHANGELOG.md) (Czech).

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md); security issues go through [SECURITY.md](SECURITY.md).

### How it's built

Simple ADB tools started as a shortcut for installing test builds from a MacBook and grew from there. It is developed AI-first: most of the code is written with [Claude Code](https://claude.com/claude-code) and reviewed, tested on real devices and released by the maintainer.

## Contributors

- Zdeněk Hejzlar – [hejzlar-development.cz](https://hejzlar-development.cz)
- Jakub Kalina – [jakubkalina.cz](https://jakubkalina.cz)

## Support

Simple ADB tools is free. If it saves you time, you can chip in at [paypal.me/cheetumen52](https://paypal.me/cheetumen52). Report bugs and ideas via [hejzlar-development.cz](https://hejzlar-development.cz) or [Issues](https://github.com/cheetumen52/simple-adb-tools/issues).

## License

See [LICENSE](LICENSE).

© 2026 Hejzlar Development

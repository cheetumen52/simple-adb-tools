# Changelog

All notable changes to Simple ADB tools. The Czech version is in [CHANGELOG.md](CHANGELOG.md). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Crash watch: the app follows logcat on every connected device and shows a crash, native crash or ANR with its stack trace, a notification and a header badge. From a crash you can restart the app, open its logcat, or copy or save the report.

### Changed
- The ADB toolset has a grouped sidebar and a heading with a description for every section. Narrow windows show icons only.

## [1.2.1] - 2026-10-14

### Fixed
- macOS: the app downloaded from GitHub was reported as “damaged”. The whole bundle is now signed, so macOS offers the usual “Open Anyway”.

## [1.2.0] - 2026-10-14

### Added
- Automatic updates: the app downloads a new version by itself, verifies its signature and installs it when you click “Update and restart”.
- “Recent APKs on device” section: the 10 most recently installed or updated apps straight from the device, with a device switcher and quick actions.
- Changelog inside the app (Settings → What's new) and notes for an available update.
- English: the app follows the system language, and you can switch it in Settings. The installer, error messages and changelog come in both languages.

### Changed
- The Support tab is now called Settings and, besides support, holds the language choice, updates and the changelog.
- “Last APKs” is now called “APKs found in folders”, and the last installed app section sits above it.
- F5 and the “Refresh” button spin the icon while refreshing devices, so you can see something is happening.

## [1.1.1] - 2026-10-14

### Added
- Emulators in the device list with their own icon and an “Emulator” badge.
- A “Refresh” button next to “Restart adb”.
- “Last installed app” section: launch, restart, stop, logcat, settings, clear data and uninstall.

### Changed
- “Launch after install” is on by default.
- F5 refreshes devices and APKs instead of reloading the window, and the log survives a reload.
- The update check reads published releases only, not drafts or bare tags.
- Faster release builds: macOS builds separately for Apple Silicon and Intel.

### Fixed
- Czech installer and uninstaller for Windows (labels were missing, including “Create desktop shortcut”).
- The header no longer wraps in a narrow window.

## [1.1.0] - 2026-10-14

### Added
- Windows and macOS version built on Tauri.
- APK installation by drag and drop, via “Open with” and from watched folders, an install queue, comparison with the version on the phone and plain-language error explanations.
- ADB toolset: device overview, screen mirroring via scrcpy, app management, logcat, remote control, deep links, Wi‑Fi debugging, developer toggles and a shell.
- Automatic recovery of dropped Wi‑Fi connections and diagnostics of a blocked local network.
- One-click download of adb, aapt2 and scrcpy from official sources.

## [1.0.0] - 2026-10-13

### Added
- First version for macOS.

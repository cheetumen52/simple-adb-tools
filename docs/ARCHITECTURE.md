# Architecture

Simple ADB tools is a [Tauri 2](https://tauri.app) app: the React + TypeScript UI runs in a WebView, and a thin Rust backend runs tools and touches files. All app logic (install queue, Wi‑Fi recovery, toolset) lives in the frontend.

```
tauri/
├── src/                     React + TypeScript
│   ├── App.tsx              startup, header, tabs, drag & drop, keyboard shortcuts
│   ├── i18n/                UI texts: cs.ts (defines the shape), en.ts, language switching
│   ├── lib/                 pure functions without Tauri (parsers, formatting, versions, changelog) + tests
│   ├── state/               one zustand store per area
│   ├── views/               one component per tab
│   └── components/          shared UI (ui.tsx) and the log
└── src-tauri/               Rust backend
    ├── src/proc.rs          runs adb/aapt2/scrcpy, streams output
    ├── src/toolchain.rs     tool detection and downloads
    ├── src/net.rs           TCP probe for Wi‑Fi diagnostics
    ├── src/files.rs         APK listing, system paths, file writes
    ├── src/i18n.rs          language of backend messages
    ├── src/lib.rs           plugins, commands, "Open with" files, updater
    ├── nsis/Czech.nsh       Czech installer strings (Tauri ships none)
    └── tauri.conf.json      window, bundle, .apk association, updater
```

## Backend (Rust)

The backend runs only three binaries: `adb`, `aapt2` and `scrcpy`. The WebView cannot start anything else.

| Command | Purpose |
|---|---|
| `toolchain_check` | Finds the tools (custom path, Android SDK, PATH, Homebrew, app folder) and verifies them by running `version`. |
| `toolchain_install` | Downloads a tool from its official source into `<app data>/tools`, reporting progress via the `install-progress` event. scrcpy is verified against `SHA256SUMS.txt`. |
| `run_tool` | One-shot run with an optional timeout (`status -2` = timed out). |
| `run_tool_to_file` | Binary stdout into a file (screenshots via `exec-out screencap`). |
| `stream_tool` / `stop_stream` | Long-running processes (logcat, scrcpy, installs). Lines arrive in batches (`proc-lines`), the end as `proc-exit`. `interrupt` sends SIGINT on Unix so scrcpy and screenrecord finish their files. |
| `probe_tcp` | A connection attempt from the app itself: `reachable` / `refused` / `blocked` / `timeout`. |
| `set_locale` | Language of user-facing backend errors. |
| `list_apks`, `system_paths`, `write_text`, `make_dir`, `path_exists`, `take_pending_files` | Files, and APKs opened through the OS. |

Platform details:

- **Windows**: processes run with `CREATE_NO_WINDOW` so no console window flashes.
- **scrcpy** gets `ADB=<path to our adb>`. Two different adb versions would keep killing each other's server.
- **"Open with"**: macOS sends `RunEvent::Opened`, Windows passes command-line arguments. A second launch is forwarded to the running window by the single-instance plugin.

## Frontend

| Store | Holds |
|---|---|
| `app` | active tab, system paths, app version |
| `toolchain` | tool status and installs |
| `installer` | devices, watched folders, APK info (`aapt2`), installed versions, install queue, last install |
| `recentApps` | recently installed apps on a device (`pm list packages -3` + `dumpsys package packages`) |
| `toolset` | ADB toolset sections (overview, apps, logcat, control, Wi‑Fi, developer, shell) |
| `wireless` | known Wi‑Fi devices, auto-reconnect, local network diagnostics |
| `mirror` | running scrcpy windows and their options |
| `crashes` | crash watch: one `logcat -b crash -b system` stream per device, parsed by `lib/crash.ts` into crash, native crash and ANR events |
| `updates` | update check and install |
| `log` | shared log, survives a WebView reload (sessionStorage) |
| `i18n` | chosen language (`system` / `cs` / `en`) and the resolved one |

Settings live in `localStorage` (`lib/storage.ts`) and every read has a default.

## Languages

- Texts live in `src/i18n/cs.ts` and `en.ts`. The `Messages` type comes from the Czech file, so English cannot miss a key or a parameter. Texts with parameters are functions (`installing: (title) => …`); each language handles its own plurals.
- Components use `useT()`, stores use `tr()`. `App` subscribes to the language, so a switch re-renders the whole tree. Device info reloads after a switch (`toolset.relocalize`).
- The default is the system language: the first supported entry of `navigator.languages`; Slovak gets Czech, everything else English.
- The backend keeps the language in `i18n.rs` (`set_locale`) and returns errors in it.
- The changelog lives in `CHANGELOG.md` (Czech) and `CHANGELOG.en.md`. Release notes carry both languages separated by `<!-- cs -->` and the app shows its own (`localizedNotes`).
- The macOS Local Network prompt is localized via `locales/*.lproj/InfoPlist.strings`, the Windows installer via NSIS (`nsis/Czech.nsh`).

## Behaviour that matters

- **Restarting the adb server drops Wi‑Fi connections.** The queue therefore re-reads devices first and restarts only when it really sees none.
- **macOS Local Network access** belongs to the process that started the adb server. When the phone answers the app but not the adb server, `wireless.diagnose` restarts the server under the app.
- **The Wi‑Fi port on Android 11+** changes every time debugging is turned on. Recovery finds it via `adb mdns services` by `ro.serialno`.
- **Crash watch** starts each device's logcat at the device's own clock (`-T "MM-DD hh:mm:ss.000"`), so old crashes in the buffer are not reported again. Only third-party apps count unless the user opts in; the package list is re-read when an unknown package crashes (it may have just been installed).
- **System apps** are removed for the current user only (`pm uninstall -k --user 0`) and can be restored with `cmd package install-existing`.
- **zustand selectors** must not return a freshly created array or object; React then loops re-rendering forever.

## Tests and CI

- `tauri/src/lib/*.test.ts`: parsers on real adb, aapt2 and dumpsys output, versions, changelog (incl. parity of both languages), formatting, paths.
- `tauri/src/i18n/i18n.test.ts`: same keys and parameters in Czech and English, no empty texts, system language selection.
- `cargo test`: version sorting, APK argument filtering, ZIP extraction (incl. path traversal protection), TCP probe, backend language.
- `scripts/check-secrets.py` looks for credentials: in staged files (pre-commit hook), in the whole repository and in the bundled frontend (CI).
- `.github/workflows/ci.yml` runs on pull requests and pushes to `main`: secret scan, types, tests, frontend build, changelog check, `cargo fmt`, `clippy` and tests on Linux and Windows.
- `.github/workflows/release.yml` builds installers only for a release: a push to `main` whose version has no tag yet. See [RELEASING.md](RELEASING.md).

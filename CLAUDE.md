# Simple ADB tools – notes for Claude

A Tauri 2 app (React + TypeScript in `tauri/src`, Rust in `tauri/src-tauri`) for Windows and macOS. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Releases: [docs/RELEASING.md](docs/RELEASING.md). Contributor guide: [CONTRIBUTING.md](CONTRIBUTING.md).

## Working rules

- **Every change gets its own branch** (`feature/…`, `fix/…`, `chore/…`), never straight to `main`. Push it and open a PR. Merge into `main` only with the owner's approval.
- **Releases only with the owner's explicit approval**, fix versions included. Merging a PR with a bumped version into `main` starts the release (the workflow tags and builds the draft), so that merge already needs approval. The same goes for publishing a draft and deleting or moving tags.
- **Every user-visible change goes into both changelogs** on the same branch: `CHANGELOG.md` in Czech under `## [Nevydáno]`, `CHANGELOG.en.md` in English under `## [Unreleased]`. Versions, dates and item counts must match (a test checks it). The changelog is shown in the app and both feed the release notes.
- **Documentation is in English** (README, docs, contributor files). The UI and changelog exist in Czech and English.
- **Maintainer push**: GitHub pushes go out as `cheetumen52`, not the active `gh` account:
  ```bash
  TOKEN="$(gh auth token --user cheetumen52)"
  AUTH="$(printf 'x-access-token:%s' "$TOKEN" | base64)"
  git -c http.https://github.com/.extraheader="Authorization: Basic $AUTH" push origin <ref>
  ```
  For `gh` commands on the repository set `GH_TOKEN="$TOKEN"`.
- **Stacked PRs**: before `gh pr merge --delete-branch` on a PR that another PR is based on, retarget the dependent PR; otherwise GitHub closes it for good.

## Checks before pushing

The pre-commit hook (`.githooks/pre-commit`, enabled by `npm install` via `core.hooksPath`) blocks commits containing credentials: keys, tokens, passwords, `.env`, keystores. Never bypass it (`--no-verify`). Mark a false positive with a `secret-scan: allow` comment on that line.

```bash
python3 scripts/check-secrets.py --all
cd tauri && npm run typecheck && npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI (`.github/workflows/ci.yml`) runs the same on Linux and Windows. Windows code can be checked locally with `cargo clippy --target x86_64-pc-windows-msvc` (needs `rustup target add x86_64-pc-windows-msvc`; a missing `llvm-rc` can be replaced for checking by a script that writes an empty `.res`).

Runtime checks: a real device and an emulator are usually attached (`adb devices`). Verify device features against both, not only through unit tests.

## Conventions

- **No hard-coded UI or log text in components or stores.** It goes into `tauri/src/i18n/cs.ts` with the same key in `en.ts` (TypeScript and a test enforce parity). Components read texts via `useT()`, stores and other code via `tr()`. User-facing backend messages go through `i18n::tr("česky", "english")` in Rust.
- **Tone** is the direct Hejzlar Development voice ("Pusť APK, zbytek je na mně" / "Drop an APK, I'll handle the rest"). Colours and fonts are tokens in `tauri/src/styles.css` following hejzlar-development.cz. Don't invent new colours.
- **Pure functions** (parsing adb output, versions, formatting) belong in `tauri/src/lib/` with a test in `*.test.ts`. Tests use real device output.
- **A new backend command** is registered in `lib.rs` → `generate_handler!` and in `src/lib/native.ts`. A new plugin needs a permission in `src-tauri/capabilities/default.json`.
- **Comments** only where the reason isn't obvious (one or two lines).

## Pitfalls we already hit

- **A zustand selector must not return a new array or object** (`useStore((s) => s.list.filter(...))`): endless re-renders and a white screen. Select state and filter in the component.
- **`useEffect` must not return `scrollIntoView(...)`**: newer WebViews return a Promise and React crashes. Wrap the body in `{ }`.
- **Restarting the adb server drops Wi‑Fi devices.** Always re-read `adb devices` before `kill-server`.
- **macOS Local Network**: `adb connect` is performed by the server. If a process without permission started it, it returns "No route to host" even though ping works. `wireless.diagnose` handles it.
- **Save custom NSIS language files without a BOM.** Tauri adds its own and a double BOM breaks `makensis`.
- **TLS is `native-tls` everywhere**, the updater included. `rustls` via `ring` breaks checking the Windows target from macOS.
- **Parallel release jobs must not write `latest.json` themselves.** The final `updater-manifest` job assembles it.
- **The macOS bundle must be ad-hoc signed as a whole** (`bundle.macOS.signingIdentity: "-"`). Otherwise only the linker signature is there, without sealed resources, and a downloaded app is reported as "damaged" with no "Open Anyway". Check: `codesign --verify --deep --strict`.
- **Emulators** have `emulator-*` serials. They belong in the device list but not in Wi‑Fi features.

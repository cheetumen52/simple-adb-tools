# Releasing

Releases are made by the project owner only.

## Steps

Installers are built only for a release. A release is a push to `main` in which the app version has no tag yet, i.e. a merged release PR. Any other push to `main` stops after the version check and builds nothing.

1. Everything meant for the release is merged into `main` and CI is green.
2. Pick the version by [SemVer](https://semver.org/): fix → patch, new feature → minor.
3. In `CHANGELOG.md` rename `## [Nevydáno]` to `## [X.Y.Z] - YYYY-MM-DD` and add an empty `## [Nevydáno]` above it. Do the same in `CHANGELOG.en.md` with `## [Unreleased]`.
4. Bump the version in three places:
   - `tauri/package.json` (and `package-lock.json` via `npm install --package-lock-only`)
   - `tauri/src-tauri/Cargo.toml` (`Cargo.lock` follows on the next build or `cargo check`)
   - `tauri/src-tauri/tauri.conf.json`
5. Commit `Release X.Y.Z` on a `release/X.Y.Z` branch, open a PR into `main` and merge it. Don't tag by hand.
6. After the push to `main`, the **Build & release** workflow:
   - sees that `vX.Y.Z` is not tagged yet (otherwise it stops);
   - runs CI;
   - tags the merged commit `vX.Y.Z`;
   - builds Windows (NSIS, MSI) and macOS (Apple Silicon, Intel), ad-hoc signs the macOS bundle and signs the updater packages;
   - creates a **draft** release with English and Czech notes from the changelogs (`scripts/release-notes.py`);
   - assembles `latest.json` for the updater.
7. Check the draft (`*-setup.exe`, `*.msi`, `*_aarch64.dmg`, `*_x64.dmg`, `*.app.tar.gz`, `*.sig`, `latest.json`) and publish it as *Latest*.

The app offers updates from published releases only; a draft or a bare tag does not trigger it.

## Automatic updates

- The updater fetches `https://github.com/cheetumen52/simple-adb-tools/releases/latest/download/latest.json`.
- Packages are signed with the key in the GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The public key is in `tauri.conf.json` → `plugins.updater.pubkey`.
- The owner keeps a backup of the key. **If the key is lost, installed apps accept no further updates** and users have to update manually once.
- A local signed build:

  ```bash
  cd tauri
  TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/simple-adb-tools.key)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat ~/.tauri/simple-adb-tools.key.password)" \
  npm run tauri build
  ```

## Manual build without a release

A manual run (*Actions → Build & release → Run workflow*) builds the same installers as workflow artifacts and creates no release.

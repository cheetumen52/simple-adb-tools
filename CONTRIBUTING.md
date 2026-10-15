# Contributing

Thanks for helping with Simple ADB tools! Bug reports, ideas and pull requests are all welcome.

## Before you start

- **Bugs**: open an [issue](https://github.com/cheetumen52/simple-adb-tools/issues/new/choose) with your OS, app version and the diagnostics from *Settings → Copy diagnostics*.
- **Bigger changes**: open an issue first so we can agree on the approach before you spend time on it.
- **Security issues**: don't open a public issue, see [SECURITY.md](SECURITY.md).

## Development setup

Requirements: Node.js 22, Rust stable ([rustup](https://rustup.rs)), Python 3 and the [Tauri prerequisites](https://tauri.app/start/prerequisites/). A phone with USB debugging or an Android emulator helps a lot.

```bash
cd tauri
npm install        # also enables the pre-commit secret scan
npm run tauri dev
```

How the app is put together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Making a change

1. Create a branch from `main`: `feature/…`, `fix/…` or `chore/…`.
2. Keep the conventions:
   - **Texts**: no hard-coded UI or log text. Add it to `tauri/src/i18n/cs.ts` and the same key to `en.ts`; TypeScript and a test check that both languages match. Use `useT()` in components and `tr()` elsewhere.
   - **Changelog**: user-visible changes go into both `CHANGELOG.en.md` (`## [Unreleased]`) and `CHANGELOG.md` (Czech, `## [Nevydáno]`) with the same number of items. If you don't speak Czech, add the English line and say so in the PR; we'll translate it.
   - **Pure logic** (parsing adb output, versions, formatting) goes into `tauri/src/lib/` with a test built on real device output.
   - **Colours and fonts** come from the tokens in `tauri/src/styles.css`.
3. Run the checks:

   ```bash
   python3 scripts/check-secrets.py --all
   cd tauri && npm run typecheck && npm test
   cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
   ```

4. Try the change on a real device or an emulator.
5. Open a pull request against `main` and fill in the template. CI runs the same checks on Linux and Windows.

Releases are cut by the maintainer, see [docs/RELEASING.md](docs/RELEASING.md).

## Never commit credentials

The pre-commit hook blocks private keys (including the updater signing key), API tokens, hard-coded passwords, `.env` files and keystores. Don't bypass it with `--no-verify`. A genuine false positive can be marked with `secret-scan: allow` on that line.

## Code of conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

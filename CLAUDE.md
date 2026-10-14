# Simple ADB tools – pokyny pro Claude

Tauri 2 aplikace (React + TypeScript v `tauri/src`, Rust v `tauri/src-tauri`) pro Windows a macOS. Architektura je v [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), vydání v [docs/RELEASING.md](docs/RELEASING.md).

## Pravidla práce

- **Každá změna patří do vlastní větve** (`feature/…`, `fix/…`), ne přímo do `main`. Větev pushni a nabídni PR. Merge do `main` dělej jen se souhlasem.
- **Vydání (tag `v*`, zveřejnění návrhu, mazání nebo přesun tagů) jen po výslovném souhlasu**, i u opravných verzí.
- **Každá uživatelsky viditelná změna jde do `CHANGELOG.md`** pod `## [Nevydáno]`, česky a ve stejné větvi. Changelog se zobrazuje v aplikaci a z něj vzniká text vydání.
- **README je anglicky**, ostatní dokumentace a UI česky.
- **Push do GitHubu** jde pod účtem `cheetumen52`, ne aktivním účtem `gh`:
  ```bash
  TOKEN="$(gh auth token --user cheetumen52)"
  AUTH="$(printf 'x-access-token:%s' "$TOKEN" | base64)"
  git -c http.https://github.com/.extraheader="Authorization: Basic $AUTH" push origin <ref>
  ```
  Pro `gh` příkazy nad repozitářem nastav `GH_TOKEN="$TOKEN"`.

## Kontroly před pushem

Pre-commit hook (`.githooks/pre-commit`, zapíná ho `npm install` přes `core.hooksPath`) blokuje commity s tajnými údaji: klíče, tokeny, hesla, `.env`, keystore. Hook nikdy neobcházej (`--no-verify`). Falešný poplach označ na řádku komentářem `secret-scan: allow`.

```bash
python3 scripts/check-secrets.py --all
cd tauri && npm run typecheck && npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI (`.github/workflows/ci.yml`) spouští totéž na Linuxu a Windows. Windows kód lze lokálně zkontrolovat přes `cargo clippy --target x86_64-pc-windows-msvc` (potřebuje `rustup target add x86_64-pc-windows-msvc`, chybějící `llvm-rc` jde pro check nahradit skriptem, který vytvoří prázdný `.res`).

## Konvence

- **UI texty jsou česky**, přímým tónem značky Hejzlar Development („Pusť APK, zbytek je na mně“). Barvy a písma jsou tokeny v `tauri/src/styles.css` podle hejzlar-development.cz. Nevymýšlej nové barvy.
- **Čisté funkce** (parsování výstupů adb, verze, formátování) patří do `tauri/src/lib/` a mají test v `*.test.ts`. Testy staví na reálných výstupech zařízení.
- **Nový příkaz backendu** se registruje v `lib.rs` → `generate_handler!` a v `src/lib/native.ts`. Nový plugin potřebuje oprávnění v `src-tauri/capabilities/default.json`.
- **Komentáře** jen tam, kde je důvod nezřejmý (jeden až dva řádky).

## Pasti, na které už jsme narazili

- **Selektor zustand nesmí vracet nové pole nebo objekt** (`useStore((s) => s.list.filter(...))`): nekonečné překreslování a bílá obrazovka. Vyber stav a filtruj v komponentě.
- **`useEffect` nesmí vracet `scrollIntoView(...)`**: v novějších WebView vrací Promise a React pak spadne. Obal tělo do `{ }`.
- **Restart adb serveru shodí Wi‑Fi zařízení.** Před `kill-server` vždy znovu načti `adb devices`.
- **Místní síť na macOS**: `adb connect` provádí server. Když ho spustil proces bez oprávnění, vrací „No route to host“, i když ping funguje. Řeší to `wireless.diagnose`.
- **Vlastní NSIS jazykový soubor ukládej bez BOM.** Tauri přidává vlastní a dvojitý BOM rozbije `makensis`.
- **TLS je všude `native-tls`**, včetně updateru. `rustls` přes `ring` znemožní kontrolu pro Windows z macOS.
- **Paralelní joby v release workflow nesmí samy zapisovat `latest.json`.** Skládá ho závěrečný job `updater-manifest`.
- **Emulátory** mají sériové číslo `emulator-*`. Patří do seznamu zařízení, ale ne do Wi‑Fi funkcí.

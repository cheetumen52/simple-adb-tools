# Simple ADB tools

**Instalace APK a každodenní práce s adb bez terminálu.** Aplikace pro Windows a macOS od [Hejzlar Development](https://hejzlar-development.cz).

[![CI](https://github.com/cheetumen52/simple-adb-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/cheetumen52/simple-adb-tools/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cheetumen52/simple-adb-tools)](https://github.com/cheetumen52/simple-adb-tools/releases/latest)

## Co umí

- **Instalace APK**: přetažením do okna, přes „Otevřít v“ i ze sledovaných složek. Fronta instalací, porovnání s verzí v telefonu, srozumitelné vysvětlení chyb s nabídkou reinstallu a volitelná automatická instalace nových buildů ze Stažených.
- **Rychlé ovládání aplikací**: poslední nainstalovaná aplikace a 10 naposledy nainstalovaných aplikací v zařízení. Spuštění, restart, logcat, vymazání dat, odinstalace.
- **ADB toolset**: přehled zařízení, zrcadlení obrazovky přes [scrcpy](https://github.com/Genymobile/scrcpy), správa aplikací (včetně stažení APK z telefonu), živý logcat, screenshot a nahrávání videa, dálkové ovládání, deep linky, vývojářské přepínače a shell.
- **Wi‑Fi ladění**: přepnutí telefonu na Wi‑Fi jedním klikem, párování pro Android 11+ a automatické obnovení spadlého spojení.
- **Bez instalace SDK**: adb, aapt2 a scrcpy si aplikace umí stáhnout sama z oficiálních zdrojů.
- **Automatické aktualizace** podepsané klíčem projektu.

## Stažení

Nejnovější verze je na stránce [Releases](https://github.com/cheetumen52/simple-adb-tools/releases/latest).

| Systém | Soubor |
|---|---|
| Windows 10/11 | `Simple.ADB.tools_<verze>_x64-setup.exe` (doporučeno) nebo `.msi` |
| macOS, Apple Silicon (M1 a novější) | `Simple.ADB.tools_<verze>_aarch64.dmg` |
| macOS, Intel | `Simple.ADB.tools_<verze>_x64.dmg` |

Aplikace zatím není podepsaná placeným certifikátem:

- **Windows**: SmartScreen při prvním spuštění zobrazí varování → *Další informace* → *Přesto spustit*.
- **macOS**: po prvním spuštění *Nastavení → Soukromí a zabezpečení → Přesto otevřít*. Pro Wi‑Fi ladění povol aplikaci přístup k *místní síti*.

## Telefon

1. *Nastavení → O telefonu* → 7× klepni na *Číslo sestavení*.
2. V *Možnostech pro vývojáře* zapni *Ladění USB* (Xiaomi a Huawei i *Instalace přes USB*).
3. Připoj telefon kabelem a potvrď *Povolit ladění USB*.

Na Windows může být potřeba USB ovladač výrobce telefonu.

## Vývoj

Požadavky: Node.js 22, Rust (stable, přes [rustup](https://rustup.rs)) a [systémové závislosti Tauri](https://tauri.app/start/prerequisites/).

```bash
cd tauri
npm install
npm run tauri dev
```

| Příkaz (ve složce `tauri/`) | Co dělá |
|---|---|
| `npm run tauri dev` | Spustí aplikaci s hot reloadem |
| `npm test` | Unit testy frontendu (Vitest) |
| `npm run typecheck` | Kontrola typů |
| `cd src-tauri && cargo test` | Unit testy Rust backendu |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | Lint Rustu |
| `npm run tauri build` | Produkční build pro aktuální systém |

Architektura a postup vydání jsou v [`docs/`](docs/), změny verzí v [`CHANGELOG.md`](CHANGELOG.md).

## Podpora

Simple ADB tools jsou zdarma. Pokud ti ušetřily čas, můžeš přispět na [paypal.me/cheetumen52](https://paypal.me/cheetumen52). Chyby a nápady hlas přes [hejzlar-development.cz](https://hejzlar-development.cz) nebo v [Issues](https://github.com/cheetumen52/simple-adb-tools/issues).

© 2026 Hejzlar Development

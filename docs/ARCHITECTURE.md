# Architektura

Simple ADB tools je aplikace na [Tauri 2](https://tauri.app): UI v Reactu a TypeScriptu běží ve WebView, tenký backend v Rustu spouští nástroje a pracuje se soubory. Veškerá logika aplikace (fronta instalací, Wi‑Fi obnova, toolset) je ve frontendu.

```
tauri/
├── src/                     React + TypeScript
│   ├── App.tsx              start aplikace, hlavička, záložky, drag & drop, klávesové zkratky
│   ├── i18n/                texty UI: cs.ts (zdroj tvaru), en.ts, přepínání jazyka
│   ├── lib/                 čisté funkce bez Tauri (parsery, formátování, verze, changelog) + testy
│   ├── state/               zustand store pro každou oblast
│   ├── views/               jedna komponenta na záložku
│   └── components/          sdílené UI (ui.tsx) a log
└── src-tauri/               Rust backend
    ├── src/proc.rs          spouštění adb/aapt2/scrcpy, streamování výstupu
    ├── src/toolchain.rs     detekce a stažení nástrojů
    ├── src/net.rs           TCP sonda pro diagnostiku Wi‑Fi
    ├── src/files.rs         seznam APK, systémové cesty, zápis souborů
    ├── src/lib.rs           pluginy, příkazy, otevírání souborů („Otevřít v“), updater
    ├── nsis/Czech.nsh       české texty instalátoru (Tauri je nemá)
    └── tauri.conf.json      okno, bundle, asociace .apk, updater
```

## Backend (Rust)

Backend spouští jen tři binárky: `adb`, `aapt2` a `scrcpy`. Webview nemůže spustit nic jiného.

| Příkaz | Účel |
|---|---|
| `toolchain_check` | Najde nástroje (vlastní cesta, Android SDK, PATH, Homebrew, složka aplikace) a ověří je spuštěním `version`. |
| `toolchain_install` | Stáhne nástroj z oficiálního zdroje do `<app data>/tools`. Průběh posílá událostí `install-progress`. scrcpy ověřuje proti `SHA256SUMS.txt`. |
| `run_tool` | Jednorázové spuštění s volitelným limitem (`status -2` = vypršel). |
| `run_tool_to_file` | Binární stdout do souboru (screenshot přes `exec-out screencap`). |
| `stream_tool` / `stop_stream` | Dlouhé procesy (logcat, scrcpy, instalace). Řádky chodí po dávkách (`proc-lines`), konec jako `proc-exit`. `interrupt` posílá na Unixu SIGINT, aby scrcpy a screenrecord dokončily soubor. |
| `probe_tcp` | Připojení z aplikace samotné: `reachable` / `refused` / `blocked` / `timeout`. |
| `list_apks`, `system_paths`, `write_text`, `make_dir`, `path_exists`, `take_pending_files` | Soubory a APK otevřené přes systém. |

Platformní detaily:

- **Windows**: procesy běží s `CREATE_NO_WINDOW`, aby neblikala konzole.
- **scrcpy** dostává `ADB=<cesta k našemu adb>`. Dvě různé verze adb by si navzájem zabíjely server.
- **„Otevřít v“**: macOS posílá `RunEvent::Opened`, Windows argumenty příkazové řádky. Druhé spuštění přesměruje single-instance plugin do běžícího okna.

## Frontend

| Store | Obsah |
|---|---|
| `app` | aktivní záložka, systémové cesty, verze aplikace |
| `toolchain` | stav nástrojů a jejich instalace |
| `installer` | zařízení, sledované složky, info o APK (`aapt2`), verze v telefonu, fronta instalací, poslední instalace |
| `recentApps` | naposledy nainstalované aplikace v zařízení (`pm list packages -3` + `dumpsys package packages`) |
| `toolset` | sekce ADB toolsetu (přehled, aplikace, logcat, ovládání, Wi‑Fi, vývojář, shell) |
| `wireless` | známá Wi‑Fi zařízení, automatické obnovení, diagnostika místní sítě |
| `mirror` | běžící okna scrcpy a jejich volby |
| `updates` | kontrola a instalace aktualizací |
| `log` | sdílený log, přežije znovunačtení WebView (sessionStorage) |
| `i18n` | zvolený jazyk (`system` / `cs` / `en`) a jazyk, který z něj plyne |

## Jazyky

- Texty jsou v `src/i18n/cs.ts` a `en.ts`. Typ `Messages` vychází z češtiny, takže angličtině nesmí chybět žádný klíč ani parametr. Texty s parametry jsou funkce (`installing: (title) => …`), skloňování řeší každý jazyk ve své funkci.
- Komponenty používají `useT()`, stores `tr()`. `App` odebírá jazyk, takže přepnutí překreslí celý strom. Informace o zařízení se po přepnutí načtou znovu (`toolset.relocalize`).
- Výchozí je jazyk systému: první podporovaný jazyk z `navigator.languages`, slovenština dostane češtinu, ostatní angličtinu.
- Backend drží jazyk v `i18n.rs` (`set_locale`) a podle něj vrací chybové hlášky.
- Changelog je v `CHANGELOG.md` (česky) a `CHANGELOG.en.md`. Poznámky k vydání obsahují oba jazyky oddělené `<!-- cs -->` a aplikace ukáže ten svůj (`localizedNotes`).
- macOS dialog o místní síti je lokalizovaný přes `locales/*.lproj/InfoPlist.strings`, instalátor pro Windows přes NSIS (`nsis/Czech.nsh`).

Nastavení se ukládá do `localStorage` (`lib/storage.ts`) a každé čtení má výchozí hodnotu.

## Chování, na kterém záleží

- **Restart adb serveru shodí Wi‑Fi spojení.** Fronta proto před restartem znovu načte zařízení a restartuje, jen když opravdu žádné nevidí.
- **Místní síť na macOS** patří procesu, který adb server spustil. Když telefon odpovídá aplikaci, ale ne adb serveru, `wireless.diagnose` restartuje server pod aplikací.
- **Wi‑Fi port na Androidu 11+** se po každém zapnutí ladění mění. Obnova ho hledá přes `adb mdns services` podle `ro.serialno`.
- **Systémové aplikace** se odebírají jen pro aktuálního uživatele (`pm uninstall -k --user 0`) a jdou vrátit přes `cmd package install-existing`.
- **Selektory zustand** nesmí vracet nově vytvořené pole nebo objekt. React pak padá na nekonečnou smyčku překreslování.

## Testy a CI

- `tauri/src/lib/*.test.ts`: parsery na reálných výstupech adb, aapt2 a dumpsys, verze, changelog (včetně shody obou jazyků), formátování, cesty.
- `tauri/src/i18n/i18n.test.ts`: stejné klíče a parametry v češtině i angličtině, žádné prázdné texty, výběr jazyka podle systému.
- `cargo test`: řazení verzí, výběr APK z argumentů, rozbalování ZIP (včetně ochrany proti path traversal), TCP sonda.
- `scripts/check-secrets.py` hledá tajné údaje: v pre-commit hooku ve staged souborech, v CI v celém repozitáři a v sestaveném frontendu, který se balí do aplikace.
- `.github/workflows/ci.yml` běží na každý push a PR: kontrola tajných údajů, typy, testy, build frontendu, kontrola changelogu, `cargo fmt`, `clippy` a testy na Linuxu i Windows.
- `.github/workflows/release.yml` nejdřív spustí CI, pak sestaví instalátory. Viz [RELEASING.md](RELEASING.md).

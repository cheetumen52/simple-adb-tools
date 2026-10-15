# Vydání nové verze

Vydání se dělá jen se souhlasem vlastníka projektu.

## Postup

Instalátory se stavějí jen při vydání. Vydání spustí push do `main`, ve kterém má aplikace verzi bez existujícího tagu, tedy sloučený PR s vydáním. Ostatní pushe do `main` skončí po kontrole verze a nic nestaví.

1. Všechno určené k vydání je sloučené v `main` a CI je zelené.
2. Zvol číslo verze podle [SemVer](https://semver.org/lang/cs/): oprava → patch, nová funkce → minor.
3. V `CHANGELOG.md` přejmenuj `## [Nevydáno]` na `## [X.Y.Z] - RRRR-MM-DD` a nad něj přidej prázdnou sekci `## [Nevydáno]`. Totéž v `CHANGELOG.en.md` s `## [Unreleased]`.
4. Zvyš verzi na třech místech:
   - `tauri/package.json` (a `package-lock.json` přes `npm install --package-lock-only`)
   - `tauri/src-tauri/Cargo.toml` (`Cargo.lock` se aktualizuje sám při buildu nebo `cargo check`)
   - `tauri/src-tauri/tauri.conf.json`
5. Commit `Release X.Y.Z` ve větvi `release/X.Y.Z`, PR do `main` a merge (se souhlasem vlastníka). Tag se nedělá ručně.
6. Workflow **Build & release** po pushi do `main`:
   - zjistí, že tag `vX.Y.Z` ještě neexistuje (jinak skončí);
   - spustí CI;
   - vytvoří tag `vX.Y.Z` na sloučeném commitu;
   - sestaví Windows (NSIS, MSI) a macOS (Apple Silicon, Intel) a podepíše balíčky pro updater;
   - založí **návrh** vydání s anglickým i českým textem z changelogů (`scripts/release-notes.py`);
   - poskládá `latest.json` pro updater.
7. Zkontroluj návrh vydání (soubory `*-setup.exe`, `*.msi`, `*_aarch64.dmg`, `*_x64.dmg`, `*.app.tar.gz`, `*.sig`, `latest.json`) a zveřejni ho jako *Latest*.

Aplikace nabízí aktualizace jen ze zveřejněných vydání. Návrh ani samotný tag ji nespustí.

## Automatické aktualizace

- Updater stahuje `https://github.com/cheetumen52/simple-adb-tools/releases/latest/download/latest.json`.
- Balíčky jsou podepsané klíčem v GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` a `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Veřejný klíč je v `tauri.conf.json` → `plugins.updater.pubkey`.
- Záloha klíče je u vlastníka v `~/.tauri/simple-adb-tools.key` (+ `.password`). **Když se klíč ztratí, nainstalované aplikace už nepřijmou žádnou aktualizaci** a uživatelé musí jednou aktualizovat ručně.
- Lokální podepsaný build:

  ```bash
  cd tauri
  TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/simple-adb-tools.key)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat ~/.tauri/simple-adb-tools.key.password)" \
  npm run tauri build
  ```

## Ruční build bez vydání

Ručně spuštěný workflow (*Actions → Build & release → Run workflow*) sestaví stejné instalátory jako artefakty a vydání nezakládá.

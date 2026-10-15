# Changelog

Všechny podstatné změny Simple ADB tools. Anglická verze je v [CHANGELOG.en.md](CHANGELOG.en.md). Formát vychází z [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/), verze se řídí [sémantickým verzováním](https://semver.org/lang/cs/).

## [Nevydáno]

### Přidáno
- Hlídání pádů: aplikace sleduje logcat všech připojených zařízení a pád, nativní pád nebo ANR ukáže i se stack trace, notifikací a odznakem v hlavičce. Z pádu jde aplikaci rovnou restartovat, otevřít její logcat, zkopírovat nebo uložit report.
- Sekce Testování: proxy pro Charles, Proxyman nebo mitmproxy jedním klikem (přes adb reverse i přes síť), režim letadlo, Wi‑Fi a mobilní data, velikost písma, hustota displeje, tmavý režim, simulace baterie a Doze.
- U aplikace jde povolit nebo odebrat runtime oprávnění a nastavit její jazyk (Android 13+), včetně arabštiny a hebrejštiny pro test RTL.
- Více zařízení najednou: výběr všech, screenshot a zrcadlení vybraných zařízení, v Ovládání a Testování přepínač „Na všechna zařízení“. Karta zařízení ukazuje stav baterie.
- Správce souborů: procházení úložiště telefonu, stažení do Stažených, nahrání přetažením, nová složka, přejmenování a mazání. U debug buildů i soukromá data aplikace přes run-as (databáze, SharedPreferences, cache).

### Změněno
- Instalace a odinstalace běží na všech vybraných zařízeních paralelně a u každého je vidět průběh. Výpis v logu nese název zařízení.
- Sekce Vývojář je teď součástí sekce Testování.
- ADB toolset má postranní menu rozdělené do skupin a nadpis s popisem každé sekce. Na úzkém okně zůstanou jen ikony.

## [1.2.1] - 2026-10-14

### Opraveno
- macOS: aplikace stažená z GitHubu se hlásila jako „poškozená“. Balík je teď celý podepsaný, takže macOS nabídne obvyklé „Přesto otevřít“.

## [1.2.0] - 2026-10-14

### Přidáno
- Automatické aktualizace: aplikace sama stáhne novou verzi, ověří její podpis a po kliknutí na „Aktualizovat a restartovat“ ji nainstaluje.
- Sekce „Poslední APK v zařízení“: 10 naposledy nainstalovaných nebo aktualizovaných aplikací přímo ze zařízení, s přepínačem zařízení a rychlými akcemi.
- Changelog přímo v aplikaci (Nastavení → Co je nového) a poznámky k dostupné aktualizaci.
- Angličtina: aplikace se řídí jazykem systému a jazyk jde přepnout v Nastavení. Instalátor, chybové hlášky i changelog jsou v obou jazycích.

### Změněno
- Záložka Support se jmenuje Nastavení a kromě podpory obsahuje volbu jazyka, aktualizace a changelog.
- „Poslední APK“ se jmenuje „Nalezené APK ve složce“ a sekce poslední nainstalované aplikace je nad ním.
- F5 a tlačítko „Obnovit“ při obnově zařízení roztočí ikonu, aby bylo vidět, že se něco děje.

## [1.1.1] - 2026-10-14

### Přidáno
- Emulátory v seznamu zařízení s vlastní ikonou a štítkem „Emulátor“.
- Tlačítko „Obnovit“ vedle „Restartovat adb“.
- Sekce „Poslední nainstalovaná aplikace“: spuštění, restart, zastavení, logcat, nastavení, vymazání dat a odinstalace.

### Změněno
- „Po instalaci spustit“ je ve výchozím stavu zapnuté.
- F5 obnovuje zařízení a APK místo znovunačtení okna a log přežije i znovunačtení.
- Kontrola aktualizací čte jen zveřejněná vydání, ne koncepty ani holé tagy.
- Rychlejší sestavení vydání: macOS zvlášť pro Apple Silicon a Intel.

### Opraveno
- Český instalátor a odinstalátor pro Windows (chyběly popisky, mimo jiné „Vytvořit zástupce na ploše“).
- Hlavička se na úzkém okně nezalamuje.

## [1.1.0] - 2026-10-14

### Přidáno
- Verze pro Windows a macOS postavená na Tauri.
- Instalace APK přetažením, přes „Otevřít v“ i ze sledovaných složek, fronta instalací, porovnání s verzí v telefonu a srozumitelné vysvětlení chyb.
- ADB toolset: přehled zařízení, zrcadlení obrazovky přes scrcpy, správa aplikací, logcat, dálkové ovládání, deep linky, Wi‑Fi ladění, vývojářské přepínače a shell.
- Automatické obnovení spadlého Wi‑Fi spojení a diagnostika blokované místní sítě.
- Stažení adb, aapt2 a scrcpy jedním klikem z oficiálních zdrojů.

## [1.0.0] - 2026-10-13

### Přidáno
- První verze pro macOS.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft, ArrowUpFromLine, Cable, Camera, ChevronLeft, Circle, Eraser, Eye, FileDown, Hammer, Home, Info, Layers, LayoutGrid,
  Lock, MonitorSmartphone, Network, Pause, Play, Power, RefreshCw, Save, Settings, Square, Sun, Terminal, Trash2, Undo2, Volume1, Volume2,
  Wifi, WifiOff, Hand,
} from "lucide-react";
import { displayName, isWireless } from "../lib/parse";
import { tabNumber, useApp } from "../state/app";
import { useToolchain } from "../state/toolchain";
import { readyDevices, useInstaller } from "../state/installer";
import { currentDevice, DEV_TOGGLES, LOG_LEVELS, SECTIONS, useToolset, type LogLevel, type ToolsetSection } from "../state/toolset";
import { knownId, wirelessStatus, useWireless, type KnownWireless, type WirelessState } from "../state/wireless";
import { MIRROR_SIZES, MIRROR_SOURCES, useMirror, type MirrorSource } from "../state/mirror";
import { useDrag } from "../state/drag";
import { Button, Card, CardTitle, ConfirmDialog, Elapsed, Kicker, Menu, Pill, Progress, SectionHeader, Spinner, Switch, TextField, type ConfirmRequest } from "../components/ui";
import { LogPanel } from "../components/LogPanel";

const ICONS: Record<ToolsetSection, typeof Info> = {
  overview: Info, mirror: MonitorSmartphone, apps: LayoutGrid, logcat: AlignLeft, control: Hand, wireless: Wifi, developer: Hammer, shell: Terminal,
};

function useDevice() {
  const serial = useToolset((s) => s.serial);
  useInstaller((s) => s.devices);
  return currentDevice(serial);
}

function DevicePicker() {
  const all = useInstaller((s) => s.devices);
  const devices = readyDevices({ devices: all });
  const device = useDevice();
  const set = useToolset((s) => s.set);
  if (devices.length > 1) {
    return (
      <select className="field" style={{ width: 200 }} value={device?.serial ?? ""} onChange={(e) => set({ serial: e.target.value })}>
        {devices.map((d) => <option key={d.serial} value={d.serial}>{displayName(d)}</option>)}
      </select>
    );
  }
  return device ? <Pill>{displayName(device)}</Pill> : null;
}

function SectionNav() {
  const { section, setSection, logcatRunning } = useToolset();
  const mirroring = useMirror((s) => Object.keys(s.running).length > 0);
  return (
    <nav className="subnav" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
      {SECTIONS.map((s) => {
        const Icon = ICONS[s.id];
        return (
          <button key={s.id} className={`subtab${section === s.id ? " active" : ""}`} onClick={() => setSection(s.id)}>
            <Icon size={12} />
            {s.title}
            {s.id === "logcat" && logcatRunning && <span className="dot" style={{ background: "var(--danger)", width: 5, height: 5 }} />}
            {s.id === "mirror" && mirroring && <span className="dot" style={{ background: "var(--light-cyan)", width: 5, height: 5 }} />}
          </button>
        );
      })}
    </nav>
  );
}

function InfoGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="grid-2" style={{ gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} className="stack" style={{ gap: 2 }}>
          <span className="kicker muted" style={{ letterSpacing: "0.12em" }}>{r.label}</span>
          <span className="mono selectable">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Overview ---------- */

function OverviewSection() {
  const { info, loadingInfo, loadInfo, reboot } = useToolset();
  const device = useDevice();
  const over = useDrag((s) => s.over) === "push";
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const askReboot = (mode: string | null) =>
    setConfirm({
      title: `Restartovat ${device ? displayName(device) : "telefon"}${mode ? ` do režimu ${mode}` : ""}?`,
      message: "Telefon se na chvíli odpojí.",
      confirm: "Restartovat",
      action: () => void reboot(mode),
    });
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row">
            <CardTitle kicker="zařízení" title={device ? displayName(device) : ""} />
            <div className="spacer" />
            {loadingInfo && <Spinner />}
            <Button small icon={<RefreshCw size={13} />} onClick={() => void loadInfo()}>Obnovit</Button>
          </div>
          <InfoGrid rows={info} />
        </div>
      </Card>
      <div className="grid-2">
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="soubory" title="Poslat do telefonu" subtitle="Pusť sem soubory, skončí v telefonu ve složce Download." />
            <div className={`dropzone${over ? " active" : ""}`} style={{ height: 64 }} data-drop="push">
              <span className="row caption secondary"><ArrowUpFromLine size={14} /> Přetáhni soubory</span>
            </div>
          </div>
        </Card>
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="napájení" title="Restart" subtitle="Běžný restart nebo režim pro flashování." />
            <div className="row">
              <Button small onClick={() => askReboot(null)}>Restartovat</Button>
              <Button small onClick={() => askReboot("recovery")}>Recovery</Button>
              <Button small onClick={() => askReboot("bootloader")}>Bootloader</Button>
            </div>
          </div>
        </Card>
      </div>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/* ---------- Mirror ---------- */

const SHORTCUTS: [string, string][] = [
  ["⌘/Alt F", "celá obrazovka"], ["⌘/Alt H", "Domů"], ["⌘/Alt B", "Zpět"], ["⌘/Alt S", "přepínač aplikací"], ["⌘/Alt P", "power"],
  ["⌘/Alt O", "zhasnout displej"], ["⌘/Alt N", "notifikace"], ["⌘/Alt R", "otočit"], ["⌘/Alt C · V", "schránka"], ["APK do okna", "nainstaluje ho"],
];

function MirrorSection() {
  const device = useDevice();
  const mirror = useMirror();
  const tc = useToolchain();
  const setTab = useApp((s) => s.setTab);
  if (tc.scrcpy.kind !== "found") {
    return (
      <Card highlight>
        <div className="stack" style={{ gap: 12 }}>
          <CardTitle kicker="zrcadlení" title="Na zrcadlení potřebuju scrcpy" subtitle="Open-source nástroj, který obrazovku telefonu zobrazí na počítači s minimálním zpožděním. Stáhnu ho z oficiálního GitHubu a ověřím kontrolní součet." />
          {tc.installing === "scrcpy" ? (
            <div className="row" style={{ gap: 10 }}><Progress value={tc.progress} /><span className="mono-sm c-muted">{Math.round(tc.progress * 100)} %</span></div>
          ) : (
            <div className="row">
              <Button variant="primary" small disabled={!!tc.installing} onClick={() => void tc.install("scrcpy")}>Stáhnout scrcpy (13 MB)</Button>
              <Button small onClick={() => setTab("requirements")}>Systémové požadavky →</Button>
            </div>
          )}
          {tc.error && <span className="caption c-danger">{tc.error}</span>}
        </div>
      </Card>
    );
  }
  if (!device) return null;
  const since = mirror.running[device.serial];
  const o = mirror.options;
  const screen = o.source === "screen";
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card highlight={!!since}>
        <div className="row" style={{ gap: 16 }}>
          <MonitorSmartphone size={26} color="var(--accent)" />
          <div className="stack" style={{ gap: 4, flex: 1 }}>
            <Kicker color={since ? "var(--light-cyan)" : "var(--text-muted)"}>{since ? "běží" : "zrcadlení"}</Kicker>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{displayName(device)} na počítači</span>
            <span className="caption">Otevře se samostatné okno. Ovládáš ho myší a klávesnicí, zavřením zrcadlení ukončíš.</span>
          </div>
          {since ? (
            <>
              <Elapsed since={since} className="mono c-cyan" />
              <Button variant="primary" icon={<Square size={13} />} onClick={() => mirror.stop(device)}>Ukončit</Button>
            </>
          ) : (
            <Button variant="primary" icon={<Play size={13} />} onClick={() => void mirror.start(device)}>Spustit zrcadlení</Button>
          )}
        </div>
      </Card>
      <Card>
        <div className="stack" style={{ gap: 14 }}>
          <div className="row top">
            <CardTitle kicker="nastavení" title="Jak zrcadlit" subtitle="Projeví se při dalším spuštění." />
            <div className="spacer" />
            {!!since && <Pill color="var(--warn)" dot={false}>běží – změny až po restartu</Pill>}
          </div>
          <div className="row" style={{ gap: 24 }}>
            <div className="stack">
              <Kicker muted>zdroj</Kicker>
              <div className="subnav">
                {MIRROR_SOURCES.map(([id, title]) => (
                  <button key={id} className={`subtab${o.source === id ? " active" : ""}`} onClick={() => mirror.setOption("source", id as MirrorSource)}>{title}</button>
                ))}
              </div>
            </div>
            <div className="stack">
              <Kicker muted>max. rozlišení</Kicker>
              <select className="field" style={{ width: 130 }} value={o.maxSize} onChange={(e) => mirror.setOption("maxSize", Number(e.target.value))}>
                {MIRROR_SIZES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
          </div>
          {!screen && <span className="caption c-warn">Kamera funguje od Androidu 12. Ovládání je v tomhle režimu vypnuté.</span>}
          <div className="grid-2" style={{ gap: 12 }}>
            <Switch label="Přenášet zvuk (Android 11+)" checked={o.audio} onChange={(v) => mirror.setOption("audio", v)} />
            <Switch label="Nahrávat na plochu" checked={o.record} onChange={(v) => mirror.setOption("record", v)} />
            <Switch label="Zhasnout displej telefonu" checked={o.turnScreenOff} disabled={!screen || o.viewOnly} onChange={(v) => mirror.setOption("turnScreenOff", v)} />
            <Switch label="Nezhasínat telefon" checked={o.stayAwake} disabled={!screen || o.viewOnly} onChange={(v) => mirror.setOption("stayAwake", v)} />
            <Switch label="Zobrazovat dotyky" checked={o.showTouches} disabled={!screen} onChange={(v) => mirror.setOption("showTouches", v)} />
            <Switch label="Okno vždy navrchu" checked={o.alwaysOnTop} onChange={(v) => mirror.setOption("alwaysOnTop", v)} />
            <Switch label="Jen sledovat (bez ovládání)" checked={o.viewOnly} disabled={!screen} onChange={(v) => mirror.setOption("viewOnly", v)} />
          </div>
        </div>
      </Card>
      <Card>
        <div className="stack" style={{ gap: 10 }}>
          <CardTitle kicker="zkratky v okně zrcadlení" title="Ovládání z klávesnice" />
          <div className="grid-2" style={{ gap: 8 }}>
            {SHORTCUTS.map(([k, label]) => (
              <div key={k} className="row" style={{ gap: 10 }}><span className="kbd">{k}</span><span className="caption secondary">{label}</span></div>
            ))}
          </div>
          <span className="caption">Pravé tlačítko myši = Zpět, prostřední = Domů. Na macOS se zkratky mačkají s ⌘, na Windows s levým Alt.</span>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Apps ---------- */

function AppsSection() {
  const t = useToolset();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const filtered = useMemo(() => {
    const q = t.packageQuery.trim().toLowerCase();
    return q ? t.packages.filter((p) => p.toLowerCase().includes(q)) : t.packages;
  }, [t.packages, t.packageQuery]);
  const pkg = t.selectedPackage;
  const system = pkg ? t.systemPackages.includes(pkg) : false;
  return (
    <div className="row top" style={{ gap: 14 }}>
      <Card compact style={{ width: 320, flexShrink: 0 }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <TextField placeholder="Hledat balíček…" value={t.packageQuery} onChange={(v) => t.set({ packageQuery: v })} />
            <Button small icon={<RefreshCw size={13} />} onClick={() => void t.loadPackages()} />
          </div>
          <Switch label="Včetně systémových" checked={t.includeSystem} onChange={(v) => { t.set({ includeSystem: v }); void t.loadPackages(); }} />
          {t.loadingPackages && <Spinner />}
          <div style={{ height: 300, overflowY: "auto" }}>
            {filtered.map((p) => (
              <button key={p} className={`pkg-item${pkg === p ? " active" : ""}`} onClick={() => void t.selectPackage(p)}>
                <span className="truncate" style={{ flex: 1 }}>{p}</span>
                {t.includeSystem && t.systemPackages.includes(p) && <span className="kicker" style={{ color: "var(--warn)", letterSpacing: "0.08em" }}>SYS</span>}
              </button>
            ))}
          </div>
          <div className="row">
            <span className="mono-sm c-muted">{filtered.length} aplikací</span>
            <div className="spacer" />
            {t.removedSystemPackages.length > 0 && (
              <Menu label={<span className="row" style={{ gap: 5, fontSize: 11.5 }}><Undo2 size={12} /> Obnovit odebrané ({t.removedSystemPackages.length})</span>}>
                {(close) => (
                  <>
                    <div className="menu-label"><Kicker muted>odebrané systémové aplikace</Kicker></div>
                    {t.removedSystemPackages.map((p) => (
                      <button key={p} className="menu-item mono" onClick={() => { close(); void t.restoreSystemPackage(p); }}>Obnovit {p}</button>
                    ))}
                  </>
                )}
              </Menu>
            )}
          </div>
        </div>
      </Card>
      <Card style={{ flex: 1, minWidth: 0 }}>
        {pkg ? (
          <div className="stack" style={{ gap: 14 }}>
            <div className="row top">
              <CardTitle kicker={system ? "systémová aplikace" : "aplikace"} title={<span className="selectable">{pkg}</span>} />
              <div className="spacer" />
              {system && <Pill color="var(--warn)" dot={false}>systémová</Pill>}
            </div>
            <InfoGrid rows={t.packageDetails} />
            <div className="row wrap">
              <Button variant="primary" small icon={<Play size={13} />} onClick={() => t.launch(pkg)}>Spustit</Button>
              <Button small icon={<Square size={13} />} onClick={() => t.forceStop(pkg)}>Zastavit</Button>
              <Button small icon={<Settings size={13} />} onClick={() => t.openSettings(pkg)}>Nastavení</Button>
              <Button small icon={<FileDown size={13} />} onClick={() => void t.pullApk(pkg)}>Stáhnout APK</Button>
            </div>
            <div className="row wrap">
              <Button small icon={<Eraser size={13} />} onClick={() => setConfirm({
                title: `Vymazat data aplikace ${pkg}?`,
                message: "Smaže se přihlášení, nastavení, cache i uložené soubory aplikace. Tohle nejde vrátit.",
                confirm: "Vymazat data",
                action: () => t.clearData(pkg),
              })}>Vymazat data</Button>
              <Button small icon={<Trash2 size={13} />} onClick={() => setConfirm(system ? {
                title: `Odebrat systémovou aplikaci ${pkg}?`,
                message: "⚠️ Systémové aplikace jsou součástí Androidu nebo nadstavby výrobce. Jejich odebrání může rozbít funkce systému: spouštěč, notifikace, aktualizace, platby, fotoaparát nebo i start telefonu.\n\nAplikace se odebere jen pro aktuálního uživatele, z disku nezmizí. Vrátit ji jde přes „Obnovit odebrané“, v krajním případě továrním resetem.\n\nPokračuj, jen pokud víš, co ta aplikace dělá.",
                confirm: "Rozumím riziku, odebrat",
                action: () => void t.uninstall(pkg),
              } : {
                title: `Odinstalovat ${pkg}?`,
                message: "Aplikace i její data zmizí z telefonu.",
                confirm: "Odinstalovat",
                action: () => void t.uninstall(pkg),
              })}>{system ? "Odebrat systémovou aplikaci" : "Odinstalovat"}</Button>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="aplikace" title="Vyber aplikaci vlevo" subtitle="Spuštění, zastavení, vymazání dat, odinstalace nebo stažení APK z telefonu do počítače." />
            <div><Button small icon={<Eye size={13} />} onClick={t.showCurrentActivity}>Co je teď na displeji?</Button></div>
          </div>
        )}
      </Card>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/* ---------- Logcat ---------- */

const levelColor: Record<string, string> = { E: "var(--danger)", F: "var(--danger)", W: "var(--warn)", I: "var(--text-secondary)", D: "rgba(1,181,213,0.85)" };

function LogcatSection() {
  const t = useToolset();
  const end = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => {
    const q = t.logcatFilter.trim().toLowerCase();
    const lines = q ? t.logcat.filter((l) => l.text.toLowerCase().includes(q)) : t.logcat;
    return lines.slice(-2000);
  }, [t.logcat, t.logcatFilter]);
  useEffect(() => {
    if (!t.logcatPaused) end.current?.scrollIntoView({ block: "end" });
  }, [visible.length, t.logcatPaused]);
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "0 24px 10px" }}>
        {t.logcatRunning ? (
          <Button variant="primary" small icon={<Square size={13} />} onClick={t.stopLogcat}>Zastavit</Button>
        ) : (
          <Button variant="primary" small icon={<Play size={13} />} onClick={() => void t.startLogcat()}>Spustit</Button>
        )}
        <select className="field" style={{ width: 110 }} value={t.logcatLevel} disabled={t.logcatRunning} onChange={(e) => t.set({ logcatLevel: e.target.value as LogLevel })}>
          {LOG_LEVELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <TextField placeholder="balíček (volitelné)" value={t.logcatPackage} disabled={t.logcatRunning} onChange={(v) => t.set({ logcatPackage: v })} style={{ width: 210 }} />
        <TextField placeholder="Filtrovat text…" value={t.logcatFilter} onChange={(v) => t.set({ logcatFilter: v })} />
        <Button small icon={t.logcatPaused ? <Play size={13} /> : <Pause size={13} />} title={t.logcatPaused ? "Pokračovat" : "Pozastavit výpis"} onClick={() => t.set({ logcatPaused: !t.logcatPaused })} />
        <Button small icon={<Trash2 size={13} />} title="Vymazat buffer" onClick={t.clearLogcat} />
        <Button small icon={<Save size={13} />} title="Uložit do souboru" disabled={!t.logcat.length} onClick={() => void t.saveLogcat()} />
      </div>
      <div className="selectable" style={{ flex: 1, overflowY: "auto", background: "var(--surface-1)", padding: "10px 24px", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
        {!t.logcat.length && <div className="mono c-muted">{t.logcatRunning ? "$ čekám na logy…" : "$ logcat zatím neběží. Klikni na Spustit."}</div>}
        {visible.map((l) => (
          <div key={l.id} style={{ color: levelColor[l.level] ?? "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.text}</div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}

/* ---------- Control ---------- */

const KEYS: [number, string, typeof Home][] = [
  [3, "Domů", Home], [4, "Zpět", ChevronLeft], [187, "Aplikace", Layers], [26, "Power", Power],
  [224, "Probudit", Sun], [82, "Odemknout", Lock], [24, "Hlasitost +", Volume2], [25, "Hlasitost −", Volume1],
];

function ControlSection() {
  const t = useToolset();
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid-2">
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="obrazovka" title="Screenshot a video" subtitle="Ukládá se na plochu a rovnou se otevře." />
            <div className="row">
              <Button small icon={<Camera size={13} />} onClick={t.screenshot}>Screenshot</Button>
              {t.recordingSince ? (
                <Button variant="primary" small icon={<Circle size={10} fill="currentColor" />} onClick={() => void t.toggleRecording()}>
                  Zastavit · <Elapsed since={t.recordingSince} className="mono" />
                </Button>
              ) : (
                <Button small icon={<Circle size={13} />} onClick={() => void t.toggleRecording()}>Nahrát video</Button>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="text" title="Napsat do telefonu" subtitle="Do aktivního pole. Jen ASCII, diakritiku adb neumí." />
            <div className="row">
              <TextField placeholder="test@example.com" value={t.typeText} onChange={(v) => t.set({ typeText: v })} onSubmit={t.sendText} />
              <Button variant="primary" small disabled={!t.typeText} onClick={t.sendText}>Odeslat</Button>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <div className="stack" style={{ gap: 10 }}>
          <CardTitle kicker="tlačítka" title="Dálkové ovládání" />
          <div className="grid-4">
            {KEYS.map(([code, label, Icon]) => <Button key={code} small icon={<Icon size={13} />} onClick={() => t.key(code, label)}>{label}</Button>)}
          </div>
          <div><Button variant="link" onClick={t.openDeveloperOptions}>Otevřít Možnosti pro vývojáře</Button></div>
        </div>
      </Card>
      <Card>
        <div className="stack" style={{ gap: 10 }}>
          <CardTitle kicker="deep link" title="Otevřít URL v telefonu" subtitle="Webový odkaz i vlastní schéma aplikace, třeba myapp://detail/42." />
          <div className="row">
            <TextField placeholder="https://… nebo myapp://…" value={t.deepLink} onChange={(v) => t.set({ deepLink: v })} onSubmit={() => t.openDeepLink()} />
            <Button variant="primary" small disabled={!t.deepLink} onClick={() => t.openDeepLink()}>Otevřít</Button>
          </div>
          {t.deepLinkHistory.map((link) => (
            <button key={link} className="btn plain mono-sm" style={{ justifyContent: "flex-start" }} onClick={() => { t.set({ deepLink: link }); t.openDeepLink(link); }}>↺ {link}</button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Wireless ---------- */

const stateBadge: Record<WirelessState, [string, string]> = {
  connected: ["Připojeno", "var(--light-cyan)"],
  reconnecting: ["Obnovuji…", "var(--accent)"],
  waiting: ["Čekám na telefon", "var(--warn)"],
  unreachable: ["Nedostupné", "var(--danger)"],
  paused: ["Odpojeno ručně", "var(--text-muted)"],
  disconnected: ["Odpojeno", "var(--text-muted)"],
};

function KnownRow({ k }: { k: KnownWireless }) {
  const w = useWireless();
  useInstaller((s) => s.devices);
  const state = wirelessStatus(k);
  const [label, color] = stateBadge[state];
  return (
    <div className="list-row" style={{ background: "var(--surface-1)" }}>
      {state === "connected" ? <Wifi size={15} color="var(--accent)" /> : <WifiOff size={15} color="var(--text-muted)" />}
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{k.name}</span>
        <span className="mono-sm c-muted truncate selectable">{k.address}</span>
      </div>
      {state === "reconnecting" && <Spinner />}
      <Pill color={color}>{label}</Pill>
      {state !== "connected" && <Button small disabled={state === "reconnecting"} onClick={() => void w.reconnect(k, true)}>Znovu připojit</Button>}
      <Button variant="plain" icon={<Trash2 size={14} />} title="Zapomenout zařízení" onClick={() => w.forget(k)} />
    </div>
  );
}

function WirelessSection() {
  const t = useToolset();
  const w = useWireless();
  const device = useDevice();
  const devices = useInstaller((s) => s.devices);
  const platform = useApp((s) => s.paths?.platform);
  return (
    <div className="stack" style={{ gap: 14 }}>
      {w.localNetworkBlocked && (
        <Card danger>
          <div className="row top" style={{ gap: 12 }}>
            <Network size={20} color="var(--danger)" />
            <div className="stack" style={{ gap: 6, flex: 1 }}>
              <Kicker color="var(--danger)">{platform === "macos" ? "macOS blokuje místní síť" : "k telefonu nevede cesta"}</Kicker>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>Bez přístupu do místní sítě se k telefonu přes Wi‑Fi nedostanu.</span>
              <span className="caption secondary">
                {platform === "macos"
                  ? "Nastavení → Soukromí a zabezpečení → Místní síť → zapni Simple ADB tools."
                  : "Zkontroluj, že je telefon ve stejné síti a že Windows Firewall nepovoluje jen veřejné sítě."}
              </span>
              <div className="row">
                <Button variant="primary" small icon={<Settings size={13} />} onClick={w.openLocalNetworkSettings}>Otevřít nastavení</Button>
                <Button small disabled={!t.connectHost} onClick={() => void t.connect()}>Zkusit znovu</Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      <Card highlight>
        <div className="row" style={{ gap: 14 }}>
          <CardTitle kicker="nejrychlejší cesta" title="Přepnout připojený telefon na Wi‑Fi" subtitle="Telefon musí být na kabelu a ve stejné síti jako počítač. Pak kabel odpojíš a ladíš bezdrátově." />
          <div className="spacer" />
          <Button variant="primary" small icon={<Wifi size={13} />} disabled={!device || isWireless(device)} onClick={() => void t.switchToWifi()}>Přepnout na Wi‑Fi</Button>
        </div>
      </Card>
      <div className="grid-2">
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="connect" title="Připojit podle adresy" subtitle="IP adresa telefonu, port 5555 doplním sám." />
            <div className="row">
              <TextField placeholder="192.168.1.42:5555" value={t.connectHost} onChange={(v) => t.set({ connectHost: v })} onSubmit={() => void t.connect()} />
              <Button small disabled={!t.connectHost} onClick={() => void t.connect()}>Připojit</Button>
            </div>
          </div>
        </Card>
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="android 11+" title="Spárovat bez kabelu" subtitle="Bezdrátové ladění → Spárovat pomocí kódu." />
            <div className="row">
              <TextField placeholder="192.168.1.42:37123" value={t.pairHost} onChange={(v) => t.set({ pairHost: v })} />
              <TextField placeholder="kód" value={t.pairCode} onChange={(v) => t.set({ pairCode: v })} onSubmit={() => void t.pair()} style={{ width: 90 }} />
              <Button small disabled={!t.pairHost || !t.pairCode} onClick={() => void t.pair()}>Spárovat</Button>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row top">
            <CardTitle
              kicker="známá zařízení"
              title={w.known.length ? "Telefony, které už byly přes Wi‑Fi" : "Zatím žádné zařízení přes Wi‑Fi"}
              subtitle="Když spojení spadne, obnovím ho sám. U Androidu 11+ si najdu i nový port."
            />
            <div className="spacer" />
            <Button small icon={<WifiOff size={13} />} disabled={!devices.some(isWireless)} onClick={() => void t.disconnectAll()}>Odpojit všechna</Button>
          </div>
          <Switch label="Automaticky obnovovat spojení" title="Při výpadku zkouším spojení obnovit několik minut, pak přestanu." checked={w.autoReconnect} onChange={w.setAutoReconnect} />
          {w.known.length > 0 && <div className="list">{w.known.map((k) => <KnownRow key={knownId(k)} k={k} />)}</div>}
          <span className="caption">Telefon přepnutý přes „Přepnout na Wi‑Fi“ (port 5555) po restartu ladění přes Wi‑Fi vypne. Pak je potřeba ho jednou připojit kabelem.</span>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Developer ---------- */

function DeveloperSection() {
  const t = useToolset();
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid-2">
        {DEV_TOGGLES.map((toggle) => {
          const on = t.toggles[toggle.id];
          return (
            <Card key={toggle.id} highlight={on === true}>
              <div className="row top" style={{ gap: 12, minHeight: 54 }}>
                <div className="stack" style={{ gap: 4, flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{toggle.title}</span>
                  <span className="caption">{toggle.help}</span>
                </div>
                {on === undefined ? <Spinner /> : <Switch label="" checked={on} onChange={(v) => void t.setToggle(toggle.id, v)} />}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="row">
        <span className="caption">Přepínače mění systémová nastavení telefonu. Před odevzdáním zařízení je vrať zpět.</span>
        <div className="spacer" />
        <Button small icon={<RefreshCw size={13} />} onClick={() => void t.loadToggles()}>Načíst stav</Button>
      </div>
    </div>
  );
}

/* ---------- Shell ---------- */

const SNIPPETS: [string, string][] = [
  ["Aktuální aktivita", "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'"],
  ["Baterie", "dumpsys battery"],
  ["Úložiště", "df -h /data"],
  ["Paměť", "cat /proc/meminfo | head -5"],
  ["Fingerprint", "getprop ro.build.fingerprint"],
  ["Displej", "wm size; wm density"],
];

function ShellSection() {
  const t = useToolset();
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <span className="mono c-accent">$</span>
        <TextField placeholder="adb shell příkaz, třeba: pm list packages -3" value={t.shellCommand} onChange={(v) => t.set({ shellCommand: v })} onSubmit={() => void t.runShell()} />
        <Button variant="primary" small disabled={!t.shellCommand || t.shellRunning} onClick={() => void t.runShell()}>Spustit</Button>
        <Button small disabled={!t.shellHistory.length} onClick={() => t.set({ shellHistory: [] })}>Vymazat</Button>
      </div>
      <div className="row wrap">
        {SNIPPETS.map(([title, cmd]) => <Button key={title} small title={cmd} onClick={() => void t.runShell(cmd)}>{title}</Button>)}
      </div>
      <div className="console">
        {!t.shellHistory.length && <span className="c-muted">Výstup se objeví tady. Příkazy běží přímo v telefonu přes adb shell.</span>}
        {[...t.shellHistory].reverse().map((e) => (
          <div key={e.id} style={{ marginBottom: 12 }}>
            <div style={{ color: e.ok ? "var(--accent)" : "var(--danger)" }}>$ {e.command}</div>
            {e.output && <div className="secondary" style={{ fontSize: 10.5 }}>{e.output}</div>}
          </div>
        ))}
        {t.shellRunning && <Spinner />}
      </div>
    </div>
  );
}

/* ---------- View ---------- */

export function ToolsetView() {
  const section = useToolset((s) => s.section);
  const device = useDevice();
  const setTab = useApp((s) => s.setTab);
  const { reload, deviceChanged } = useToolset.getState();
  const serial = device?.serial;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      reload();
    } else deviceChanged();
  }, [serial]);

  const body = () => {
    switch (section) {
      case "overview": return <OverviewSection />;
      case "mirror": return <MirrorSection />;
      case "apps": return <AppsSection />;
      case "control": return <ControlSection />;
      case "wireless": return <WirelessSection />;
      case "developer": return <DeveloperSection />;
      case "shell": return <ShellSection />;
      default: return null;
    }
  };

  const locked = !device && section !== "wireless";
  return (
    <>
      <div style={{ padding: "24px 24px 14px", display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionHeader
          number={tabNumber("toolset")}
          kicker="adb toolset"
          title="Všechno, kvůli čemu bys otevíral terminál"
          lede="Logcat, správa aplikací, zrcadlení, video, deep linky, Wi‑Fi ladění i vývojářské přepínače. Jedním klikem."
          trailing={<DevicePicker />}
        />
        <SectionNav />
      </div>
      {locked ? (
        <div className="scroll" style={{ padding: "0 24px" }}>
          <Card>
            <div className="row" style={{ gap: 12 }}>
              <Cable size={18} color="var(--text-muted)" />
              <div className="stack" style={{ gap: 2, flex: 1 }}>
                <span style={{ fontWeight: 600 }}>Žádný připojený telefon</span>
                <span className="caption">Nástroje se odemknou, jakmile připojíš telefon s laděním USB nebo přes Wi‑Fi.</span>
              </div>
              <Button small onClick={() => setTab("requirements")}>Návod →</Button>
            </div>
          </Card>
        </div>
      ) : section === "logcat" ? (
        <LogcatSection />
      ) : (
        <>
          <div className="scroll"><div style={{ padding: "0 24px 24px" }}>{body()}</div></div>
          {section !== "shell" && <LogPanel height={160} />}
        </>
      )}
    </>
  );
}

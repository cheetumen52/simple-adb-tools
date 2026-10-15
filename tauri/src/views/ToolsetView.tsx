import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft, ArrowUpFromLine, Cable, Camera, ChevronLeft, Circle, Eraser, Eye, FileDown, Home, Info, Layers, LayoutGrid,
  Lock, MonitorSmartphone, Network, Pause, Play, Power, RefreshCw, Save, Settings, Square, Sun, Terminal, Trash2, Undo2, Volume1, Volume2,
  Wifi, WifiOff, Hand, Bug, FlaskConical, FolderOpen, Link,
} from "lucide-react";
import { displayName, isEmulator, isReady, isWireless } from "../lib/parse";
import { tabNumber, useApp } from "../state/app";
import { useToolchain } from "../state/toolchain";
import { useInstaller } from "../state/installer";
import { BROADCAST, DEVICELESS, LOG_LEVELS, SECTION_GROUPS, useToolset, type LogLevel, type ToolsetSection } from "../state/toolset";
import { useCrashes } from "../state/crashes";
import { CrashesSection } from "./toolset/CrashesSection";
import { TestingSection } from "./toolset/TestingSection";
import { FilesSection } from "./toolset/FilesSection";
import { DeepLinksSection } from "./toolset/DeepLinksSection";
import { DevicePicker, InfoGrid, useDevice } from "./toolset/shared";
import { knownId, wirelessStatus, useWireless, type KnownWireless, type WirelessState } from "../state/wireless";
import { MIRROR_SIZES, MIRROR_SOURCES, useMirror, type MirrorSource } from "../state/mirror";
import { useDrag } from "../state/drag";
import { Button, Card, CardTitle, ConfirmDialog, Elapsed, Kicker, Menu, Pill, Progress, Spinner, Switch, TextField, type ConfirmRequest } from "../components/ui";
import { LogPanel } from "../components/LogPanel";
import { locale, useT, type Messages } from "../i18n";
import { permissionLabel } from "../lib/devicetools";

const ICONS: Record<ToolsetSection, typeof Info> = {
  overview: Info, mirror: MonitorSmartphone, files: FolderOpen, apps: LayoutGrid, logcat: AlignLeft, crashes: Bug, deeplinks: Link, control: Hand, wireless: Wifi, testing: FlaskConical, shell: Terminal,
};

function SectionNav() {
  const { section, setSection, logcatRunning } = useToolset();
  const mirroring = useMirror((s) => Object.keys(s.running).length > 0);
  const unseen = useCrashes((s) => s.unseen);
  const t = useT();
  return (
    <nav className="toolnav">
      {SECTION_GROUPS.map(({ group, sections }) => (
        <div key={group} className="toolnav-group">
          <span className="kicker muted toolnav-label">{t.toolset.groups[group]}</span>
          {sections.map((id) => {
            const Icon = ICONS[id];
            return (
              <button key={id} className={`navitem${section === id ? " active" : ""}`} onClick={() => setSection(id)} title={t.toolset.sections[id]}>
                <Icon size={14} />
                <span className="navlabel">{t.toolset.sections[id]}</span>
                {id === "logcat" && logcatRunning && <span className="dot navmark" style={{ background: "var(--danger)" }} />}
                {id === "mirror" && mirroring && <span className="dot navmark" style={{ background: "var(--light-cyan)" }} />}
                {id === "crashes" && unseen > 0 && <span className="navbadge">{unseen}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/* ---------- Overview ---------- */

function OverviewSection() {
  const { info, stats, loadingInfo, loadInfo, reboot } = useToolset();
  const device = useDevice();
  const over = useDrag((s) => s.over) === "push";
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const t = useT();
  const m = t.toolset.overview;
  const askReboot = (mode: string | null) =>
    setConfirm({
      title: m.rebootTitle(device ? displayName(device) : t.common.phone, mode),
      message: m.rebootMessage,
      confirm: t.common.restart,
      action: () => void reboot(mode),
    });
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row">
            <CardTitle kicker={m.deviceKicker} title={device ? displayName(device) : ""} />
            <div className="spacer" />
            {loadingInfo && <Spinner />}
            <Button small icon={<RefreshCw size={13} />} onClick={() => void loadInfo()}>{t.common.refresh}</Button>
          </div>
          {stats.length > 0 && (
            <div className="stats">
              {stats.map((s) => (
                <div key={s.label} className="stat">
                  <span className="kicker muted">{s.label}</span>
                  <span className="stat-value">{s.value}</span>
                  {s.fraction != null && (
                    <div className={`stat-bar${s.warn ? " warn" : ""}`}><div style={{ width: `${Math.round(s.fraction * 100)}%` }} /></div>
                  )}
                  <span className="caption truncate">{s.sub || "\u00a0"}</span>
                </div>
              ))}
            </div>
          )}
          <InfoGrid rows={info} />
        </div>
      </Card>
      <div className="grid-2">
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker={m.filesKicker} title={m.pushTitle} subtitle={m.pushSubtitle} />
            <div className={`dropzone${over ? " active" : ""}`} style={{ minHeight: 64 }} data-drop="push">
              <span className="row caption secondary"><ArrowUpFromLine size={14} /> {m.pushDrop}</span>
            </div>
          </div>
        </Card>
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker={m.powerKicker} title={m.rebootCard} subtitle={m.rebootSubtitle} />
            <div className="row">
              <Button small onClick={() => askReboot(null)}>{t.common.restart}</Button>
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

type ShortcutLabel = keyof Messages["toolset"]["mirror"]["shortcuts"];

/** `null` key = the label itself names the gesture ("APK into window"). */
const SHORTCUTS: [string | null, ShortcutLabel][] = [
  ["⌘/Alt F", "fullscreen"], ["⌘/Alt H", "home"], ["⌘/Alt B", "back"], ["⌘/Alt S", "switcher"], ["⌘/Alt P", "power"],
  ["⌘/Alt O", "screenOff"], ["⌘/Alt N", "notifications"], ["⌘/Alt R", "rotate"], ["⌘/Alt C · V", "clipboard"], [null, "apkInstalls"],
];

function MirrorSection() {
  const device = useDevice();
  const mirror = useMirror();
  const tc = useToolchain();
  const setTab = useApp((s) => s.setTab);
  const t = useT();
  const m = t.toolset.mirror;
  if (tc.scrcpy.kind !== "found") {
    return (
      <Card highlight>
        <div className="stack" style={{ gap: 12 }}>
          <CardTitle kicker={m.kicker} title={m.needsScrcpyTitle} subtitle={m.needsScrcpySubtitle} />
          {tc.installing === "scrcpy" ? (
            <div className="row" style={{ gap: 10 }}><Progress value={tc.progress} /><span className="mono-sm c-muted">{Math.round(tc.progress * 100)} %</span></div>
          ) : (
            <div className="row">
              <Button variant="primary" small disabled={!!tc.installing} onClick={() => void tc.install("scrcpy")}>{m.downloadScrcpy}</Button>
              <Button small onClick={() => setTab("requirements")}>{t.common.toRequirements}</Button>
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
            <Kicker color={since ? "var(--light-cyan)" : "var(--text-muted)"}>{since ? m.running : m.kicker}</Kicker>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{m.onComputer(displayName(device))}</span>
            <span className="caption">{m.windowHint}</span>
          </div>
          {since ? (
            <>
              <Elapsed since={since} className="mono c-cyan" />
              <Button variant="primary" icon={<Square size={13} />} onClick={() => mirror.stop(device)}>{m.stop}</Button>
            </>
          ) : (
            <Button variant="primary" icon={<Play size={13} />} onClick={() => void mirror.start(device)}>{m.start}</Button>
          )}
        </div>
      </Card>
      <Card>
        <div className="stack" style={{ gap: 14 }}>
          <div className="row top">
            <CardTitle kicker={m.settingsKicker} title={m.settingsTitle} subtitle={m.settingsSubtitle} />
            <div className="spacer" />
            {!!since && <Pill color="var(--warn)" dot={false}>{m.restartNeeded}</Pill>}
          </div>
          <div className="row" style={{ gap: 24 }}>
            <div className="stack">
              <Kicker muted>{m.source}</Kicker>
              <div className="subnav">
                {MIRROR_SOURCES.map((id) => (
                  <button key={id} className={`subtab${o.source === id ? " active" : ""}`} onClick={() => mirror.setOption("source", id as MirrorSource)}>{m.sources[id]}</button>
                ))}
              </div>
            </div>
            <div className="stack">
              <Kicker muted>{m.maxSize}</Kicker>
              <select className="field" style={{ width: 130 }} value={o.maxSize} onChange={(e) => mirror.setOption("maxSize", Number(e.target.value))}>
                {MIRROR_SIZES.map((v) => <option key={v} value={v}>{v ? `${v} px` : m.sizeFull}</option>)}
              </select>
            </div>
          </div>
          {!screen && <span className="caption c-warn">{m.cameraHint}</span>}
          <div className="grid-2" style={{ gap: 12 }}>
            <Switch label={m.audio} checked={o.audio} onChange={(v) => mirror.setOption("audio", v)} />
            <Switch label={m.record} checked={o.record} onChange={(v) => mirror.setOption("record", v)} />
            <Switch label={m.turnScreenOff} checked={o.turnScreenOff} disabled={!screen || o.viewOnly} onChange={(v) => mirror.setOption("turnScreenOff", v)} />
            <Switch label={m.stayAwake} checked={o.stayAwake} disabled={!screen || o.viewOnly} onChange={(v) => mirror.setOption("stayAwake", v)} />
            <Switch label={m.showTouches} checked={o.showTouches} disabled={!screen} onChange={(v) => mirror.setOption("showTouches", v)} />
            <Switch label={m.alwaysOnTop} checked={o.alwaysOnTop} onChange={(v) => mirror.setOption("alwaysOnTop", v)} />
            <Switch label={m.viewOnly} checked={o.viewOnly} disabled={!screen} onChange={(v) => mirror.setOption("viewOnly", v)} />
          </div>
        </div>
      </Card>
      <Card>
        <div className="stack" style={{ gap: 10 }}>
          <CardTitle kicker={m.shortcutsKicker} title={m.shortcutsTitle} />
          <div className="grid-2" style={{ gap: 8 }}>
            {SHORTCUTS.map(([k, label]) => (
              <div key={label} className="row" style={{ gap: 10 }}><span className="kbd">{k ?? m.shortcuts.apkDrop}</span><span className="caption secondary">{m.shortcuts[label]}</span></div>
            ))}
          </div>
          <span className="caption">{m.mouseHint}</span>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Apps ---------- */

// Arabic and Hebrew are there to test right-to-left layouts.
const APP_LOCALES = ["cs-CZ", "sk-SK", "en-US", "en-GB", "de-DE", "pl-PL", "uk-UA", "fr-FR", "es-ES", "it-IT", "hu-HU", "ar", "he", "ja-JP"];

function AppPermissions({ pkg }: { pkg: string }) {
  const { packagePermissions, packageLocales, setPermission, setAppLocale } = useToolset();
  const a = useT().toolset.apps;
  const names = new Intl.DisplayNames([locale()], { type: "language" });
  const current = packageLocales?.[0] ?? "";
  return (
    <div className="grid-2" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row">
          <Kicker muted>{a.permissionsKicker}</Kicker>
          <div className="spacer" />
          {packagePermissions.length > 0 && (
            <>
              <Button variant="link" onClick={() => void setPermission(pkg, packagePermissions.filter((p) => !p.granted).map((p) => p.name), true)}>{a.grantAll}</Button>
              <Button variant="link" onClick={() => void setPermission(pkg, packagePermissions.filter((p) => p.granted).map((p) => p.name), false)}>{a.revokeAll}</Button>
            </>
          )}
        </div>
        {packagePermissions.length === 0 && <span className="caption">{a.noPermissions}</span>}
        {packagePermissions.map((p) => (
          <Switch key={p.name} label={<span className="mono-sm">{permissionLabel(p.name)}</span>} checked={p.granted} onChange={(v) => void setPermission(pkg, [p.name], v)} />
        ))}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <Kicker muted>{a.localeKicker}</Kicker>
        {packageLocales == null ? (
          <span className="caption">{a.localeUnsupported}</span>
        ) : (
          <select className="field" value={current} onChange={(e) => void setAppLocale(pkg, e.target.value || null)}>
            <option value="">{a.localeSystem}</option>
            {[...new Set([...(current && !APP_LOCALES.includes(current) ? [current] : []), ...APP_LOCALES])].map((tag) => (
              <option key={tag} value={tag}>{names.of(tag) ?? tag} ({tag})</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function AppsSection() {
  const t = useToolset();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const filtered = useMemo(() => {
    const q = t.packageQuery.trim().toLowerCase();
    return q ? t.packages.filter((p) => p.toLowerCase().includes(q)) : t.packages;
  }, [t.packages, t.packageQuery]);
  const pkg = t.selectedPackage;
  const system = pkg ? t.systemPackages.includes(pkg) : false;
  const m = useT();
  const a = m.toolset.apps;
  return (
    <div className="row top" style={{ gap: 14 }}>
      <Card compact style={{ width: 320, flexShrink: 0 }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <TextField placeholder={a.search} value={t.packageQuery} onChange={(v) => t.set({ packageQuery: v })} />
            <Button small icon={<RefreshCw size={13} />} onClick={() => void t.loadPackages()} />
          </div>
          <Switch label={a.includeSystem} checked={t.includeSystem} onChange={(v) => { t.set({ includeSystem: v }); void t.loadPackages(); }} />
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
            <span className="mono-sm c-muted">{a.count(filtered.length)}</span>
            <div className="spacer" />
            {t.removedSystemPackages.length > 0 && (
              <Menu label={<span className="row" style={{ gap: 5, fontSize: 11.5 }}><Undo2 size={12} /> {a.restoreRemoved(t.removedSystemPackages.length)}</span>}>
                {(close) => (
                  <>
                    <div className="menu-label"><Kicker muted>{a.removedKicker}</Kicker></div>
                    {t.removedSystemPackages.map((p) => (
                      <button key={p} className="menu-item mono" onClick={() => { close(); void t.restoreSystemPackage(p); }}>{a.restore(p)}</button>
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
              <CardTitle kicker={system ? a.systemKicker : a.appKicker} title={<span className="selectable">{pkg}</span>} />
              <div className="spacer" />
              {system && <Pill color="var(--warn)" dot={false}>{a.systemPill}</Pill>}
            </div>
            <InfoGrid rows={t.packageDetails} />
            <AppPermissions pkg={pkg} />
            <div className="row wrap">
              <Button variant="primary" small icon={<Play size={13} />} onClick={() => t.launch(pkg)}>{m.common.launch}</Button>
              <Button small icon={<Square size={13} />} onClick={() => t.forceStop(pkg)}>{m.common.stop}</Button>
              <Button small icon={<Settings size={13} />} onClick={() => t.openSettings(pkg)}>{m.common.settings}</Button>
              <Button small icon={<FileDown size={13} />} onClick={() => void t.pullApk(pkg)}>{a.pullApk}</Button>
            </div>
            <div className="row wrap">
              <Button small icon={<Eraser size={13} />} onClick={() => setConfirm({
                title: m.confirm.clearDataTitle(pkg),
                message: m.confirm.clearDataMessage,
                confirm: m.common.clearData,
                action: () => t.clearData(pkg),
              })}>{m.common.clearData}</Button>
              <Button small icon={<Trash2 size={13} />} onClick={() => setConfirm(system ? {
                title: a.removeSystemTitle(pkg),
                message: a.removeSystemMessage,
                confirm: a.removeSystemConfirm,
                action: () => void t.uninstall(pkg),
              } : {
                title: m.confirm.uninstallTitle(pkg),
                message: m.confirm.uninstallPhoneMessage,
                confirm: m.common.uninstall,
                action: () => void t.uninstall(pkg),
              })}>{system ? a.removeSystem : m.common.uninstall}</Button>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker={a.appKicker} title={a.pickTitle} subtitle={a.pickSubtitle} />
            <div><Button small icon={<Eye size={13} />} onClick={t.showCurrentActivity}>{a.currentActivity}</Button></div>
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
  const m = useT();
  const l = m.toolset.logcat;
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
          <Button variant="primary" small icon={<Square size={13} />} onClick={t.stopLogcat}>{m.common.stop}</Button>
        ) : (
          <Button variant="primary" small icon={<Play size={13} />} onClick={() => void t.startLogcat()}>{m.common.launch}</Button>
        )}
        <select className="field" style={{ width: 110 }} value={t.logcatLevel} disabled={t.logcatRunning} onChange={(e) => t.set({ logcatLevel: e.target.value as LogLevel })}>
          {LOG_LEVELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <TextField placeholder={l.packagePlaceholder} value={t.logcatPackage} disabled={t.logcatRunning} onChange={(v) => t.set({ logcatPackage: v })} style={{ width: 210 }} />
        <TextField placeholder={l.filterPlaceholder} value={t.logcatFilter} onChange={(v) => t.set({ logcatFilter: v })} />
        <Button small icon={t.logcatPaused ? <Play size={13} /> : <Pause size={13} />} title={t.logcatPaused ? l.resume : l.pause} onClick={() => t.set({ logcatPaused: !t.logcatPaused })} />
        <Button small icon={<Trash2 size={13} />} title={l.clearBuffer} onClick={t.clearLogcat} />
        <Button small icon={<Save size={13} />} title={l.save} disabled={!t.logcat.length} onClick={() => void t.saveLogcat()} />
      </div>
      <div className="selectable" style={{ flex: 1, overflowY: "auto", background: "var(--surface-1)", padding: "10px 24px", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
        {!t.logcat.length && <div className="mono c-muted">{t.logcatRunning ? l.waiting : l.idle}</div>}
        {visible.map((l) => (
          <div key={l.id} style={{ color: levelColor[l.level] ?? "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.text}</div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}

/* ---------- Control ---------- */

type KeyLabel = keyof Messages["toolset"]["control"]["keys"];

const KEYS: [number, KeyLabel, typeof Home][] = [
  [3, "home", Home], [4, "back", ChevronLeft], [187, "apps", Layers], [26, "power", Power],
  [224, "wake", Sun], [82, "unlock", Lock], [24, "volumeUp", Volume2], [25, "volumeDown", Volume1],
];

function ControlSection() {
  const t = useToolset();
  const m = useT();
  const c = m.toolset.control;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid-2">
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker={c.screenKicker} title={c.screenTitle} subtitle={c.screenSubtitle} />
            <div className="row">
              <Button small icon={<Camera size={13} />} onClick={t.screenshot}>{c.screenshot}</Button>
              {t.recordingSince ? (
                <Button variant="primary" small icon={<Circle size={10} fill="currentColor" />} onClick={() => void t.toggleRecording()}>
                  {c.stopRecording} · <Elapsed since={t.recordingSince} className="mono" />
                </Button>
              ) : (
                <Button small icon={<Circle size={13} />} onClick={() => void t.toggleRecording()}>{c.record}</Button>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker={c.textKicker} title={c.textTitle} subtitle={c.textSubtitle} />
            <div className="row">
              <TextField placeholder="test@example.com" value={t.typeText} onChange={(v) => t.set({ typeText: v })} onSubmit={t.sendText} />
              <Button variant="primary" small disabled={!t.typeText} onClick={t.sendText}>{c.send}</Button>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <div className="stack" style={{ gap: 10 }}>
          <CardTitle kicker={c.keysKicker} title={c.keysTitle} />
          <div className="grid-4">
            {KEYS.map(([code, label, Icon]) => <Button key={code} small icon={<Icon size={13} />} onClick={() => t.key(code, c.keys[label])}>{c.keys[label]}</Button>)}
          </div>
          <div><Button variant="link" onClick={t.openDeveloperOptions}>{c.developerOptions}</Button></div>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Wireless ---------- */

const stateColor: Record<WirelessState, string> = {
  connected: "var(--light-cyan)",
  reconnecting: "var(--accent)",
  waiting: "var(--warn)",
  unreachable: "var(--danger)",
  paused: "var(--text-muted)",
  disconnected: "var(--text-muted)",
};

function KnownRow({ k }: { k: KnownWireless }) {
  const w = useWireless();
  useInstaller((s) => s.devices);
  const state = wirelessStatus(k);
  const m = useT().toolset.wireless;
  return (
    <div className="list-row" style={{ background: "var(--surface-1)" }}>
      {state === "connected" ? <Wifi size={15} color="var(--accent)" /> : <WifiOff size={15} color="var(--text-muted)" />}
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{k.name}</span>
        <span className="mono-sm c-muted truncate selectable">{k.address}</span>
      </div>
      {state === "reconnecting" && <Spinner />}
      <Pill color={stateColor[state]}>{m.states[state]}</Pill>
      {state !== "connected" && <Button small disabled={state === "reconnecting"} onClick={() => void w.reconnect(k, true)}>{m.reconnect}</Button>}
      <Button variant="plain" icon={<Trash2 size={14} />} title={m.forget} onClick={() => w.forget(k)} />
    </div>
  );
}

function WirelessSection() {
  const t = useToolset();
  const w = useWireless();
  const device = useDevice();
  const devices = useInstaller((s) => s.devices);
  const platform = useApp((s) => s.paths?.platform);
  const msg = useT();
  const m = msg.toolset.wireless;
  return (
    <div className="stack" style={{ gap: 14 }}>
      {w.localNetworkBlocked && (
        <Card danger>
          <div className="row top" style={{ gap: 12 }}>
            <Network size={20} color="var(--danger)" />
            <div className="stack" style={{ gap: 6, flex: 1 }}>
              <Kicker color="var(--danger)">{platform === "macos" ? m.macBlockedKicker : m.noRouteKicker}</Kicker>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{m.blockedTitle}</span>
              <span className="caption secondary">{platform === "macos" ? m.macBlockedHint : m.noRouteHint}</span>
              <div className="row">
                <Button variant="primary" small icon={<Settings size={13} />} onClick={w.openLocalNetworkSettings}>{m.openSettings}</Button>
                <Button small disabled={!t.connectHost} onClick={() => void t.connect()}>{msg.common.tryAgain}</Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      <Card highlight>
        <div className="row" style={{ gap: 14 }}>
          <CardTitle kicker={m.fastestKicker} title={m.switchTitle} subtitle={m.switchSubtitle} />
          <div className="spacer" />
          <Button variant="primary" small icon={<Wifi size={13} />} disabled={!device || isWireless(device) || isEmulator(device)} onClick={() => void t.switchToWifi()}>{m.switch}</Button>
        </div>
      </Card>
      <div className="grid-2">
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="connect" title={m.connectTitle} subtitle={m.connectSubtitle} />
            <div className="row">
              <TextField placeholder="192.168.1.42:5555" value={t.connectHost} onChange={(v) => t.set({ connectHost: v })} onSubmit={() => void t.connect()} />
              <Button small disabled={!t.connectHost} onClick={() => void t.connect()}>{m.connect}</Button>
            </div>
          </div>
        </Card>
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <CardTitle kicker="android 11+" title={m.pairTitle} subtitle={m.pairSubtitle} />
            <div className="row">
              <TextField placeholder="192.168.1.42:37123" value={t.pairHost} onChange={(v) => t.set({ pairHost: v })} />
              <TextField placeholder={m.code} value={t.pairCode} onChange={(v) => t.set({ pairCode: v })} onSubmit={() => void t.pair()} style={{ width: 90 }} />
              <Button small disabled={!t.pairHost || !t.pairCode} onClick={() => void t.pair()}>{m.pair}</Button>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row top">
            <CardTitle
              kicker={m.knownKicker}
              title={w.known.length ? m.knownTitle : m.knownEmpty}
              subtitle={m.knownSubtitle}
            />
            <div className="spacer" />
            <Button small icon={<WifiOff size={13} />} disabled={!devices.some(isWireless)} onClick={() => void t.disconnectAll()}>{m.disconnectAll}</Button>
          </div>
          <Switch label={m.autoReconnect} title={m.autoReconnectHelp} checked={w.autoReconnect} onChange={w.setAutoReconnect} />
          {w.known.length > 0 && <div className="list">{w.known.map((k) => <KnownRow key={knownId(k)} k={k} />)}</div>}
          <span className="caption">{m.tcpipHint}</span>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Shell ---------- */

type SnippetLabel = keyof Messages["toolset"]["shell"]["snippets"];

const SNIPPETS: [SnippetLabel, string][] = [
  ["activity", "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'"],
  ["battery", "dumpsys battery"],
  ["storage", "df -h /data"],
  ["memory", "cat /proc/meminfo | head -5"],
  ["fingerprint", "getprop ro.build.fingerprint"],
  ["display", "wm size; wm density"],
];

function ShellSection() {
  const t = useToolset();
  const msg = useT();
  const m = msg.toolset.shell;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <span className="mono c-accent">$</span>
        <TextField placeholder={m.placeholder} value={t.shellCommand} onChange={(v) => t.set({ shellCommand: v })} onSubmit={() => void t.runShell()} />
        <Button variant="primary" small disabled={!t.shellCommand || t.shellRunning} onClick={() => void t.runShell()}>{msg.common.launch}</Button>
        <Button small disabled={!t.shellHistory.length} onClick={() => t.set({ shellHistory: [] })}>{m.clear}</Button>
      </div>
      <div className="row wrap">
        {SNIPPETS.map(([label, cmd]) => <Button key={label} small title={cmd} onClick={() => void t.runShell(cmd)}>{m.snippets[label]}</Button>)}
      </div>
      <div className="console">
        {!t.shellHistory.length && <span className="c-muted">{m.empty}</span>}
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
  const m = useT().toolset;
  const broadcast = useToolset((s) => s.broadcast);
  const readyCount = useInstaller((s) => s.devices.filter(isReady).length);

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
      case "files": return <FilesSection />;
      case "apps": return <AppsSection />;
      case "crashes": return <CrashesSection />;
      case "deeplinks": return <DeepLinksSection />;
      case "control": return <ControlSection />;
      case "wireless": return <WirelessSection />;
      case "testing": return <TestingSection />;
      case "shell": return <ShellSection />;
      default: return null;
    }
  };

  const deviceless = DEVICELESS.includes(section);
  const locked = !device && !deviceless;
  return (
    <div className="toolset">
      <SectionNav />
      <div className="toolmain">
        <div className="toolhead">
          <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
            <Kicker>{tabNumber("toolset")} · {m.kicker}</Kicker>
            <div className="toolhead-title">{m.sections[section]}</div>
            <div className="lede">{m.descriptions[section]}</div>
          </div>
          {!deviceless && (
            <div className="stack" style={{ gap: 8, alignItems: "flex-end" }}>
              <DevicePicker />
              {BROADCAST.includes(section) && readyCount > 1 && (
                <Switch label={m.broadcast(readyCount)} title={m.broadcastHelp} checked={broadcast} onChange={(v) => useToolset.getState().set({ broadcast: v })} />
              )}
            </div>
          )}
        </div>
        {locked ? (
          <div className="scroll" style={{ padding: "0 24px" }}>
            <Card>
              <div className="row" style={{ gap: 12 }}>
                <Cable size={18} color="var(--text-muted)" />
                <div className="stack" style={{ gap: 2, flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{m.noPhone}</span>
                  <span className="caption">{m.noPhoneHint}</span>
                </div>
                <Button small onClick={() => setTab("requirements")}>{m.guide}</Button>
              </div>
            </Card>
          </div>
        ) : section === "logcat" ? (
          <LogcatSection />
        ) : (
          <>
            <div className="scroll"><div style={{ padding: "0 24px 24px" }}>{body()}</div></div>
            {section !== "shell" && section !== "crashes" && <LogPanel height={160} />}
          </>
        )}
      </div>
    </div>
  );
}

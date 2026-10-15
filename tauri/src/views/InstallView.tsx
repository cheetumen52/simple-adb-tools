import { useEffect, useState } from "react";
import { recentDevice, useRecentApps, type RecentAction } from "../state/recentApps";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { AlignLeft, BatteryMedium, Eraser, Play, RefreshCcw, Settings, Square, Trash2 } from "lucide-react";
import { useToolset } from "../state/toolset";
import { latestCrash, useCrashes } from "../state/crashes";
import { Cable, Camera, Folder, Monitor, MonitorSmartphone, MonitorX, MoreHorizontal, OctagonX, Package, RefreshCw, RotateCw, Smartphone, Wifi, WifiOff, Wrench, X } from "lucide-react";
import { apkVersion, displayName, isEmulator, isReady, isWireless, type Device } from "../lib/parse";
import { bytes, timeAgo } from "../lib/format";
import { tabNumber, useApp } from "../state/app";
import { useToolchain } from "../state/toolchain";
import { apkInfo, apkKey, canInstall, comparison, targets, useInstaller } from "../state/installer";
import { reconnectingDevices, useWireless } from "../state/wireless";
import { useMirror } from "../state/mirror";
import { useDrag } from "../state/drag";
import { BrandMark, Button, Card, Checkbox, ConfirmDialog, Elapsed, Kicker, Menu, Pill, SectionHeader, Spinner, Switch, type ConfirmRequest } from "../components/ui";
import { LogPanel } from "../components/LogPanel";
import type { ApkEntry } from "../lib/native";
import { useT } from "../i18n";

function DeviceRow({ device }: { device: Device }) {
  const { selected, details, toggleSelected, screenshot } = useInstaller();
  const mirror = useMirror();
  const scrcpyReady = useToolchain((s) => s.scrcpy.kind === "found");
  const isSelected = selected.includes(device.serial);
  const ready = isReady(device);
  const d = details[device.serial];
  const mirroring = !!mirror.running[device.serial];
  const t = useT();
  return (
    <Card compact highlight={ready && isSelected}>
      <div className="row" style={{ gap: 12, cursor: ready ? "pointer" : "default" }} onClick={() => ready && toggleSelected(device.serial)}>
        <Checkbox checked={isSelected} disabled={!ready} onChange={() => toggleSelected(device.serial)} />
        {(() => {
          const Icon = isEmulator(device) ? Monitor : isWireless(device) ? Wifi : Smartphone;
          return <Icon size={20} color={ready ? "var(--accent)" : "var(--text-muted)"} />;
        })()}
        <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{displayName(device)}</span>
          <div className="row" style={{ gap: 6 }}>
            {d && <span className="caption secondary">Android {d.android}{d.manufacturer ? ` · ${d.manufacturer}` : ""}</span>}
            {d?.battery != null && (
              <span className="caption secondary row" style={{ gap: 3 }} title={t.install.batteryHelp}>
                <BatteryMedium size={12} color={d.battery <= 15 ? "var(--danger)" : "var(--text-muted)"} />{d.battery} %
              </span>
            )}
            {d && <span className="c-muted">·</span>}
            <span className="mono-sm c-muted selectable">{device.serial}</span>
          </div>
        </div>
        <div className="row" onClick={(e) => e.stopPropagation()}>
          {ready && scrcpyReady && (
            <Button small icon={mirroring ? <MonitorX size={14} /> : <MonitorSmartphone size={14} />} onClick={() => mirror.toggle(device)} title={mirroring ? t.install.stopMirror : t.install.mirror} />
          )}
          {ready && <Button small icon={<Camera size={14} />} onClick={() => void screenshot(device)} title={t.install.screenshotHelp} />}
          {isEmulator(device) && <Pill color="var(--accent)" dot={false}>{t.common.emulator}</Pill>}
          {device.state === "device" && <Pill>{t.common.connected}</Pill>}
          {device.state === "unauthorized" && <Pill color="var(--warn)">{t.install.confirmUsb}</Pill>}
          {device.state === "offline" && <Pill color="var(--danger)">{t.common.offline}</Pill>}
          {!["device", "unauthorized", "offline"].includes(device.state) && <Pill color="var(--text-muted)">{device.state}</Pill>}
        </div>
      </div>
    </Card>
  );
}

function DevicesSection() {
  const { devices, selected, running, restartAdb, manualRefresh, manualRefreshing, selectAll, screenshot } = useInstaller();
  const mirror = useMirror();
  const scrcpyReady = useToolchain((s) => s.scrcpy.kind === "found");
  const ready = devices.filter(isReady);
  const chosen = ready.filter((d) => selected.includes(d.serial));
  const mirroring = chosen.some((d) => mirror.running[d.serial]);
  useWireless((s) => s.states);
  const adbReady = useToolchain((s) => s.adb.kind === "found");
  const setTab = useApp((s) => s.setTab);
  const reconnecting = reconnectingDevices();
  const t = useT();
  const m = t.install;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <Kicker muted>{m.devicesKicker}</Kicker>
        <div className="spacer" />
        <Button small icon={<RefreshCw size={13} className={manualRefreshing ? "spin" : undefined} />} disabled={!adbReady} onClick={() => void manualRefresh()} title={m.refreshHelp}>{t.common.refresh}</Button>
        <Button small icon={<RotateCw size={13} />} disabled={running || !adbReady} onClick={() => void restartAdb()}>{t.common.restartAdb}</Button>
      </div>
      {!adbReady ? (
        <Card>
          <div className="row" style={{ gap: 12 }}>
            <Wrench size={18} color="var(--warn)" />
            <span className="secondary">{m.adbMissing}</span>
            <div className="spacer" />
            <Button variant="primary" small onClick={() => setTab("requirements")}>{t.common.toRequirements}</Button>
          </div>
        </Card>
      ) : (
        !devices.length &&
        !reconnecting.length && (
          <Card>
            <div className="row" style={{ gap: 12 }}>
              <Cable size={18} color="var(--text-muted)" />
              <div className="stack" style={{ gap: 2 }}>
                <span className="title-sm" style={{ fontSize: 13 }}>{m.noPhone}</span>
                <span className="caption">{m.noPhoneHint}</span>
              </div>
            </div>
          </Card>
        )
      )}
      {ready.length > 1 && (
        <div className="batchbar">
          <Checkbox checked={chosen.length === ready.length} onChange={() => selectAll(chosen.length !== ready.length)} />
          <span className="caption secondary">{m.selectedCount(chosen.length, ready.length)}</span>
          <Button variant="link" onClick={() => selectAll(chosen.length !== ready.length)}>{chosen.length === ready.length ? m.selectNone : m.selectAll}</Button>
          <div className="spacer" />
          <Button small icon={<Camera size={13} />} disabled={!chosen.length} onClick={() => chosen.forEach((d) => void screenshot(d))}>{m.screenshotSelected}</Button>
          {scrcpyReady && (
            <Button small icon={mirroring ? <MonitorX size={13} /> : <MonitorSmartphone size={13} />} disabled={!chosen.length} onClick={() => chosen.forEach((d) => (mirroring ? mirror.stop(d) : void mirror.start(d)))}>
              {mirroring ? m.stopMirrors : m.mirrorSelected}
            </Button>
          )}
        </div>
      )}
      {devices.map((d) => <DeviceRow key={d.serial} device={d} />)}
      {reconnecting.map((k) => (
        <Card compact key={k.address}>
          <div className="row" style={{ gap: 12 }}>
            <Spinner />
            <WifiOff size={18} color="var(--warn)" />
            <div className="stack" style={{ gap: 2, flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{k.name}</span>
              <span className="caption secondary">{m.wifiDropped}</span>
            </div>
            <Pill color="var(--warn)">{m.reconnecting}</Pill>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DropZone() {
  const { running, currentTitle, startedAt, queuedCount, progress } = useInstaller();
  const over = useDrag((s) => s.over) === "install";
  const m = useT().install;
  const rows = Object.entries(progress);
  return (
    <div className={`dropzone${over ? " active" : ""}`} data-drop="install">
      {running ? (
        <>
          <Spinner />
          <div className="truncate" style={{ fontSize: 14, fontWeight: 500, maxWidth: "80%" }}>{m.installing(currentTitle)}</div>
          <div className="row">
            {startedAt && <Elapsed since={startedAt} />}
            {queuedCount > 0 && <span className="mono c-muted">{m.queued(queuedCount)}</span>}
          </div>
          {rows.length > 1 && (
            <div className="row wrap" style={{ justifyContent: "center", gap: 6, marginTop: 4 }}>
              {rows.map(([serial, p]) => (
                <Pill key={serial} color={p.state === "ok" ? "var(--light-cyan)" : p.state === "failed" ? "var(--danger)" : "var(--accent)"}>
                  {p.device} · {m.progress[p.state]}
                </Pill>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <BrandMark size={34} arrow />
          <div style={{ fontSize: 16, fontWeight: 600 }}>{m.dropTitle}</div>
          <div className="caption">{m.dropHint}</div>
        </>
      )}
    </div>
  );
}

function FailureBanner() {
  const { failureHint, enqueueInstall, dismissFailure } = useInstaller();
  const t = useT();
  if (!failureHint) return null;
  return (
    <Card danger>
      <div className="row top" style={{ gap: 12 }}>
        <OctagonX size={18} color="var(--danger)" />
        <div className="stack" style={{ flex: 1, gap: 4 }}>
          <Kicker color="var(--danger)">{t.install.failureKicker}</Kicker>
          <span style={{ fontSize: 13 }}>{failureHint.device ? `${failureHint.device}: ` : ""}{t.failures[failureHint.reason]}</span>
        </div>
        {failureHint.suggestReinstall && failureHint.file && (
          <Button variant="primary" small onClick={() => enqueueInstall([failureHint.file!], true)}>{t.install.tryReinstall}</Button>
        )}
        {!failureHint.suggestReinstall && failureHint.retryable && failureHint.file && (
          <Button small onClick={() => enqueueInstall([failureHint.file!], false)}>{t.common.tryAgain}</Button>
        )}
        <Button variant="plain" icon={<X size={14} />} onClick={dismissFailure} />
      </div>
    </Card>
  );
}

function ComparisonBadge({ apk }: { apk: ApkEntry }) {
  const s = useInstaller();
  const m = useT().install;
  const device = targets(s)[0];
  if (!device) return null;
  const c = comparison(s, apk, device);
  if (!c) return null;
  const suffix = c.installed ? m.onPhone(c.installed.versionName) : "";
  switch (c.comparison) {
    case "notInstalled": return <Pill color="var(--text-muted)" dot={false}>{m.notOnPhone}</Pill>;
    case "upgrade": return <Pill dot={false}>{m.newer(suffix)}</Pill>;
    case "same": return <Pill color="var(--text-muted)" dot={false}>{m.alreadyInstalled}</Pill>;
    case "downgrade": return <Pill color="var(--warn)" dot={false}>{m.older(suffix)}</Pill>;
    default: return null;
  }
}

function ApkRow({ apk, newest, onConfirm }: { apk: ApkEntry; newest: boolean; onConfirm: (r: ConfirmRequest) => void }) {
  const s = useInstaller();
  const aapt2Ready = useToolchain((t) => t.aapt2.kind === "found");
  const downloads = useApp((a) => a.paths?.downloads);
  const info = apkInfo(s, apk);
  const allowed = canInstall(s);
  const t = useT();
  const parts: string[] = [];
  if (info) {
    if (info.label) parts.push(info.label);
    parts.push(apkVersion(info), info.pkg);
  } else if (!aapt2Ready) parts.push(t.install.noAapt2);
  parts.push(bytes(apk.size), timeAgo(apk.modifiedMs));
  if (apk.folder !== downloads) parts.push(apk.folder);
  return (
    <div className="list-row">
      <Package size={16} color={newest ? "var(--accent)" : "var(--text-muted)"} />
      <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
        <div className="row" style={{ minWidth: 0 }}>
          <span className="truncate" style={{ fontWeight: newest ? 600 : 500 }}>{apk.name}</span>
          {newest && <Pill color="var(--accent)" dot={false}>{t.install.newest}</Pill>}
          <ComparisonBadge apk={apk} />
        </div>
        <span className="mono-sm c-muted truncate">{parts.join("  ·  ")}</span>
      </div>
      <Button small disabled={!allowed} onClick={() => s.enqueueInstall([apk.path], true)}>{t.install.reinstall}</Button>
      <Button variant={newest ? "primary" : "ghost"} small disabled={!allowed} onClick={() => s.enqueueInstall([apk.path], s.reinstallMode)}>{t.install.installAction}</Button>
      <Menu label={<MoreHorizontal size={16} color="var(--text-muted)" />}>
        {(close) => (
          <>
            <button className="menu-item" onClick={() => { void revealItemInDir(apk.path); close(); }}>{t.common.showInFolder}</button>
            {info && (
              <>
                <button className="menu-item" onClick={() => { void navigator.clipboard.writeText(info.pkg); close(); }}>{t.common.copyPackage}</button>
                <div className="menu-sep" />
                <button
                  className="menu-item c-danger"
                  disabled={!allowed}
                  onClick={() => {
                    close();
                    onConfirm({ title: t.confirm.uninstallTitle(info.pkg), message: t.confirm.uninstallSelectedMessage, confirm: t.common.uninstall, action: () => s.enqueueUninstall(info.pkg) });
                  }}
                >
                  {t.install.uninstallSelected}
                </button>
              </>
            )}
          </>
        )}
      </Menu>
    </div>
  );
}

function ApkSection() {
  const { apks, watchedFolders, addFolder, removeFolder } = useInstaller();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const m = useT().install;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <Kicker muted>{m.apksKicker}</Kicker>
        <div className="spacer" />
        <Menu label={<span className="row" style={{ gap: 6 }}><Folder size={13} /> {m.folders(watchedFolders.length)}</span>}>
          {(close) => (
            <>
              <div className="menu-label"><Kicker muted>{m.watchedKicker}</Kicker></div>
              {watchedFolders.map((f) => (
                <div key={f} className="row" style={{ padding: "2px 4px" }}>
                  <button className="menu-item truncate" style={{ flex: 1 }} onClick={() => { void openPath(f); close(); }}>{f}</button>
                  <Button variant="plain" icon={<X size={13} />} title={m.stopWatching} onClick={() => removeFolder(f)} />
                </div>
              ))}
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { close(); void addFolder(); }}>{m.addFolder}</button>
            </>
          )}
        </Menu>
      </div>
      {!apks.length ? (
        <Card><span className="caption">{m.noApks}</span></Card>
      ) : (
        <div className="list">
          {apks.map((apk, i) => <ApkRow key={apkKey(apk)} apk={apk} newest={i === 0} onConfirm={setConfirm} />)}
        </div>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function RecentAppsSection() {
  const recent = useRecentApps();
  const all = useInstaller((s) => s.devices);
  const selected = useInstaller((s) => s.selected);
  const setTab = useApp((a) => a.setTab);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const ready = all.filter(isReady);
  const t = useT();
  const m = t.install;
  const device = recentDevice(recent.serial);
  const serial = device?.serial ?? null;

  useEffect(() => {
    if (serial && recent.loadedFor !== serial) void useRecentApps.getState().load();
  }, [serial, selected.join(",")]);

  const openLogcat = (pkg: string) => {
    const toolset = useToolset.getState();
    if (toolset.logcatRunning) toolset.stopLogcat();
    toolset.set({ logcatPackage: pkg, section: "logcat", serial });
    setTab("toolset");
    window.setTimeout(() => void useToolset.getState().startLogcat(), 300);
  };
  const ask = (pkg: string, action: RecentAction) =>
    setConfirm(
      action === "clearData"
        ? { title: t.confirm.clearDataTitle(pkg), message: t.confirm.clearDataMessage, confirm: t.common.clearData, action: () => void recent.action(pkg, action) }
        : { title: t.confirm.uninstallTitle(pkg), message: t.confirm.uninstallFromMessage(device ? displayName(device) : t.common.device), confirm: t.common.uninstall, action: () => void recent.action(pkg, action) },
    );

  if (!ready.length) return null;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <Kicker muted>{m.recentKicker}</Kicker>
        <div className="spacer" />
        {ready.length > 1 && (
          <select className="field" style={{ width: 190 }} value={serial ?? ""} onChange={(e) => recent.setSerial(e.target.value)}>
            {ready.map((d) => <option key={d.serial} value={d.serial}>{displayName(d)}</option>)}
          </select>
        )}
        <Button small icon={<RefreshCw size={13} className={recent.loading ? "spin" : undefined} />} onClick={() => void recent.load()} title={m.recentReload} />
      </div>
      {!recent.apps.length ? (
        <Card><span className="caption">{recent.loading ? m.recentLoading : m.recentEmpty}</span></Card>
      ) : (
        <div className="list">
          {recent.apps.map((app) => (
            <div key={app.pkg} className="list-row">
              <Package size={16} color="var(--text-muted)" />
              <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                <span className="mono truncate selectable" style={{ color: "var(--text-light)" }}>{app.pkg}</span>
                <span className="mono-sm c-muted truncate">
                  {app.versionName}  ·  {app.lastUpdate === app.firstInstall ? m.installedAgo : m.updatedAgo} {app.lastUpdate ? timeAgo(app.lastUpdate) : "?"}
                </span>
              </div>
              <Button small icon={<Play size={13} />} onClick={() => void recent.action(app.pkg, "launch")}>{t.common.launch}</Button>
              <Menu label={<MoreHorizontal size={16} color="var(--text-muted)" />}>
                {(close) => (
                  <>
                    <button className="menu-item" onClick={() => { close(); void recent.action(app.pkg, "restart"); }}>{t.common.restart}</button>
                    <button className="menu-item" onClick={() => { close(); void recent.action(app.pkg, "stop"); }}>{t.common.stop}</button>
                    <button className="menu-item" onClick={() => { close(); openLogcat(app.pkg); }}>{t.common.logcat}</button>
                    <button className="menu-item" onClick={() => { close(); void recent.action(app.pkg, "settings"); }}>{m.settingsOnPhone}</button>
                    <button className="menu-item" onClick={() => { close(); void navigator.clipboard.writeText(app.pkg); }}>{t.common.copyPackage}</button>
                    <div className="menu-sep" />
                    <button className="menu-item c-danger" onClick={() => { close(); ask(app.pkg, "clearData"); }}>{t.common.clearData}</button>
                    <button className="menu-item c-danger" onClick={() => { close(); ask(app.pkg, "uninstall"); }}>{t.common.uninstall}</button>
                  </>
                )}
              </Menu>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function LastAppSection() {
  const s = useInstaller();
  const setTab = useApp((a) => a.setTab);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const last = s.lastInstalled;
  const allowed = targets(s).length > 0;
  const crash = useCrashes((c) => (last ? latestCrash(c.events, last.pkg) : null));
  const t = useT();
  const m = t.install;

  const openLogcat = () => {
    if (!last) return;
    const toolset = useToolset.getState();
    if (toolset.logcatRunning) toolset.stopLogcat();
    toolset.set({ logcatPackage: last.pkg, section: "logcat" });
    setTab("toolset");
    window.setTimeout(() => void useToolset.getState().startLogcat(), 300);
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <Kicker muted>{m.lastKicker}</Kicker>
      {!last ? (
        <Card><span className="caption">{m.lastEmpty}</span></Card>
      ) : (
        <Card>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row top">
              <Package size={18} color="var(--accent)" />
              <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                <span className="title-sm">{last.label ?? last.pkg}</span>
                <span className="mono-sm c-muted truncate selectable">
                  {[last.pkg, last.version, timeAgo(last.at), last.devices.join(", ")].filter(Boolean).join("  ·  ")}
                </span>
              </div>
              {crash && (
                <button className="pill-button" onClick={() => { useToolset.getState().setSection("crashes"); setTab("toolset"); }}>
                  <Pill color="var(--danger)">{t.crashes.lastCrash(timeAgo(crash.at))}</Pill>
                </button>
              )}
              {!allowed && <Pill color="var(--warn)" dot={false}>{m.pickDevice}</Pill>}
            </div>
            <div className="row wrap">
              <Button variant="primary" small icon={<Play size={13} />} disabled={!allowed} onClick={() => void s.appAction("launch")}>{t.common.launch}</Button>
              <Button small icon={<RefreshCcw size={13} />} disabled={!allowed} onClick={() => void s.appAction("restart")}>{t.common.restart}</Button>
              <Button small icon={<Square size={13} />} disabled={!allowed} onClick={() => void s.appAction("stop")}>{t.common.stop}</Button>
              <Button small icon={<AlignLeft size={13} />} disabled={!allowed} onClick={openLogcat}>{t.common.logcat}</Button>
              <Button small icon={<Settings size={13} />} disabled={!allowed} onClick={() => void s.appAction("settings")}>{t.common.settings}</Button>
              <Button small icon={<Eraser size={13} />} disabled={!allowed} onClick={() => setConfirm({
                title: t.confirm.clearDataTitle(last.label ?? last.pkg),
                message: t.confirm.clearDataSelectedMessage,
                confirm: t.common.clearData,
                action: () => void s.appAction("clearData"),
              })}>{t.common.clearData}</Button>
              <Button small icon={<Trash2 size={13} />} disabled={!allowed} onClick={() => setConfirm({
                title: t.confirm.uninstallTitle(last.label ?? last.pkg),
                message: t.confirm.uninstallSelectedMessage,
                confirm: t.common.uninstall,
                action: () => s.enqueueUninstall(last.pkg),
              })}>{t.common.uninstall}</Button>
            </div>
          </div>
        </Card>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

export function InstallView() {
  const { reinstallMode, launchAfterInstall, autoInstall, setOption } = useInstaller();
  const m = useT().install;
  return (
    <>
      <div className="scroll">
        <div className="page">
          <SectionHeader
            number={tabNumber("install")}
            kicker={m.kicker}
            title={m.title}
            lede={m.lede}
          />
          <DevicesSection />
          <DropZone />
          <div className="row wrap" style={{ gap: 20 }}>
            <Switch label={m.reinstallOption} title={m.reinstallOptionHelp} checked={reinstallMode} onChange={(v) => setOption("reinstallMode", v)} />
            <Switch label={m.launchAfter} checked={launchAfterInstall} onChange={(v) => setOption("launchAfterInstall", v)} />
            <Switch label={m.autoInstall} title={m.autoInstallHelp} checked={autoInstall} onChange={(v) => setOption("autoInstall", v)} />
          </div>
          <FailureBanner />
          <LastAppSection />
          <ApkSection />
          <RecentAppsSection />
        </div>
      </div>
      <LogPanel />
    </>
  );
}


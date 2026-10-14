import { useState } from "react";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { Cable, Camera, Folder, MonitorSmartphone, MonitorX, MoreHorizontal, OctagonX, Package, RotateCw, Smartphone, Wifi, WifiOff, Wrench, X } from "lucide-react";
import { apkVersion, displayName, isReady, isWireless, type Device } from "../lib/parse";
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

function DeviceRow({ device }: { device: Device }) {
  const { selected, details, toggleSelected, screenshot } = useInstaller();
  const mirror = useMirror();
  const scrcpyReady = useToolchain((s) => s.scrcpy.kind === "found");
  const isSelected = selected.includes(device.serial);
  const ready = isReady(device);
  const d = details[device.serial];
  const mirroring = !!mirror.running[device.serial];
  return (
    <Card compact highlight={ready && isSelected}>
      <div className="row" style={{ gap: 12, cursor: ready ? "pointer" : "default" }} onClick={() => ready && toggleSelected(device.serial)}>
        <Checkbox checked={isSelected} disabled={!ready} onChange={() => toggleSelected(device.serial)} />
        {isWireless(device) ? <Wifi size={20} color={ready ? "var(--accent)" : "var(--text-muted)"} /> : <Smartphone size={20} color={ready ? "var(--accent)" : "var(--text-muted)"} />}
        <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{displayName(device)}</span>
          <div className="row" style={{ gap: 6 }}>
            {d && <span className="caption secondary">Android {d.android}{d.manufacturer ? ` · ${d.manufacturer}` : ""}</span>}
            {d && <span className="c-muted">·</span>}
            <span className="mono-sm c-muted selectable">{device.serial}</span>
          </div>
        </div>
        <div className="row" onClick={(e) => e.stopPropagation()}>
          {ready && scrcpyReady && (
            <Button small icon={mirroring ? <MonitorX size={14} /> : <MonitorSmartphone size={14} />} onClick={() => mirror.toggle(device)} title={mirroring ? "Ukončit zrcadlení" : "Zrcadlit obrazovku"} />
          )}
          {ready && <Button small icon={<Camera size={14} />} onClick={() => void screenshot(device)} title="Screenshot z telefonu na plochu" />}
          {device.state === "device" && <Pill>Připojeno</Pill>}
          {device.state === "unauthorized" && <Pill color="var(--warn)">Potvrď ladění USB na telefonu</Pill>}
          {device.state === "offline" && <Pill color="var(--danger)">Offline</Pill>}
          {!["device", "unauthorized", "offline"].includes(device.state) && <Pill color="var(--text-muted)">{device.state}</Pill>}
        </div>
      </div>
    </Card>
  );
}

function DevicesSection() {
  const { devices, running, restartAdb } = useInstaller();
  useWireless((s) => s.states);
  const adbReady = useToolchain((s) => s.adb.kind === "found");
  const setTab = useApp((s) => s.setTab);
  const reconnecting = reconnectingDevices();
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <Kicker muted>zařízení</Kicker>
        <div className="spacer" />
        <Button small icon={<RotateCw size={13} />} disabled={running || !adbReady} onClick={() => void restartAdb()}>Restartovat adb</Button>
      </div>
      {!adbReady ? (
        <Card>
          <div className="row" style={{ gap: 12 }}>
            <Wrench size={18} color="var(--warn)" />
            <span className="secondary">Chybí adb. Bez něj se k telefonu nedostanu.</span>
            <div className="spacer" />
            <Button variant="primary" small onClick={() => setTab("requirements")}>Systémové požadavky →</Button>
          </div>
        </Card>
      ) : (
        !devices.length &&
        !reconnecting.length && (
          <Card>
            <div className="row" style={{ gap: 12 }}>
              <Cable size={18} color="var(--text-muted)" />
              <div className="stack" style={{ gap: 2 }}>
                <span className="title-sm" style={{ fontSize: 13 }}>Žádný telefon</span>
                <span className="caption">Připoj ho kabelem se zapnutým laděním USB. Návod je v Systémových požadavcích.</span>
              </div>
            </div>
          </Card>
        )
      )}
      {devices.map((d) => <DeviceRow key={d.serial} device={d} />)}
      {reconnecting.map((k) => (
        <Card compact key={k.address}>
          <div className="row" style={{ gap: 12 }}>
            <Spinner />
            <WifiOff size={18} color="var(--warn)" />
            <div className="stack" style={{ gap: 2, flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{k.name}</span>
              <span className="caption secondary">Wi‑Fi spojení spadlo, obnovuji ho…</span>
            </div>
            <Pill color="var(--warn)">Obnovuji</Pill>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DropZone() {
  const { running, currentTitle, startedAt, queuedCount } = useInstaller();
  const over = useDrag((s) => s.over) === "install";
  return (
    <div className={`dropzone${over ? " active" : ""}`} data-drop="install">
      {running ? (
        <>
          <Spinner />
          <div className="truncate" style={{ fontSize: 14, fontWeight: 500, maxWidth: "80%" }}>Instaluji {currentTitle}</div>
          <div className="row">
            {startedAt && <Elapsed since={startedAt} />}
            {queuedCount > 0 && <span className="mono c-muted">ve frontě: {queuedCount}</span>}
          </div>
        </>
      ) : (
        <>
          <BrandMark size={34} arrow />
          <div style={{ fontSize: 16, fontWeight: 600 }}>Přetáhni APK sem</div>
          <div className="caption">nebo kamkoli do okna · na ikonu appky · „Otevřít v“</div>
        </>
      )}
    </div>
  );
}

function FailureBanner() {
  const { failureHint, enqueueInstall, dismissFailure } = useInstaller();
  if (!failureHint) return null;
  return (
    <Card danger>
      <div className="row top" style={{ gap: 12 }}>
        <OctagonX size={18} color="var(--danger)" />
        <div className="stack" style={{ flex: 1, gap: 4 }}>
          <Kicker color="var(--danger)">proč to selhalo</Kicker>
          <span style={{ fontSize: 13 }}>{failureHint.message}</span>
        </div>
        {failureHint.suggestReinstall && failureHint.file && (
          <Button variant="primary" small onClick={() => enqueueInstall([failureHint.file!], true)}>Zkusit reinstall</Button>
        )}
        {!failureHint.suggestReinstall && failureHint.retryable && failureHint.file && (
          <Button small onClick={() => enqueueInstall([failureHint.file!], false)}>Zkusit znovu</Button>
        )}
        <Button variant="plain" icon={<X size={14} />} onClick={dismissFailure} />
      </div>
    </Card>
  );
}

function ComparisonBadge({ apk }: { apk: ApkEntry }) {
  const s = useInstaller();
  const device = targets(s)[0];
  if (!device) return null;
  const c = comparison(s, apk, device);
  if (!c) return null;
  const suffix = c.installed ? ` (v telefonu ${c.installed.versionName})` : "";
  switch (c.comparison) {
    case "notInstalled": return <Pill color="var(--text-muted)" dot={false}>v telefonu není</Pill>;
    case "upgrade": return <Pill dot={false}>novější{suffix}</Pill>;
    case "same": return <Pill color="var(--text-muted)" dot={false}>už nainstalováno</Pill>;
    case "downgrade": return <Pill color="var(--warn)" dot={false}>starší{suffix}</Pill>;
    default: return null;
  }
}

function ApkRow({ apk, newest, onConfirm }: { apk: ApkEntry; newest: boolean; onConfirm: (r: ConfirmRequest) => void }) {
  const s = useInstaller();
  const aapt2Ready = useToolchain((t) => t.aapt2.kind === "found");
  const downloads = useApp((a) => a.paths?.downloads);
  const info = apkInfo(s, apk);
  const allowed = canInstall(s);
  const parts: string[] = [];
  if (info) {
    if (info.label) parts.push(info.label);
    parts.push(apkVersion(info), info.pkg);
  } else if (!aapt2Ready) parts.push("bez aapt2 neznám verzi");
  parts.push(bytes(apk.size), timeAgo(apk.modifiedMs));
  if (apk.folder !== downloads) parts.push(apk.folder);
  return (
    <div className="list-row">
      <Package size={16} color={newest ? "var(--accent)" : "var(--text-muted)"} />
      <div className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
        <div className="row" style={{ minWidth: 0 }}>
          <span className="truncate" style={{ fontWeight: newest ? 600 : 500 }}>{apk.name}</span>
          {newest && <Pill color="var(--accent)" dot={false}>nejnovější</Pill>}
          <ComparisonBadge apk={apk} />
        </div>
        <span className="mono-sm c-muted truncate">{parts.join("  ·  ")}</span>
      </div>
      <Button small disabled={!allowed} onClick={() => s.enqueueInstall([apk.path], true)}>Reinstall</Button>
      <Button variant={newest ? "primary" : "ghost"} small disabled={!allowed} onClick={() => s.enqueueInstall([apk.path], s.reinstallMode)}>Instalovat</Button>
      <Menu label={<MoreHorizontal size={16} color="var(--text-muted)" />}>
        {(close) => (
          <>
            <button className="menu-item" onClick={() => { void revealItemInDir(apk.path); close(); }}>Ukázat ve složce</button>
            {info && (
              <>
                <button className="menu-item" onClick={() => { void navigator.clipboard.writeText(info.pkg); close(); }}>Kopírovat název balíčku</button>
                <div className="menu-sep" />
                <button
                  className="menu-item c-danger"
                  disabled={!allowed}
                  onClick={() => {
                    close();
                    onConfirm({ title: `Odinstalovat ${info.pkg}?`, message: "Aplikace i její data zmizí z vybraných zařízení.", confirm: "Odinstalovat", action: () => s.enqueueUninstall(info.pkg) });
                  }}
                >
                  Odinstalovat z vybraných zařízení
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
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <Kicker muted>poslední apk</Kicker>
        <div className="spacer" />
        <Menu label={<span className="row" style={{ gap: 6 }}><Folder size={13} /> Složky ({watchedFolders.length})</span>}>
          {(close) => (
            <>
              <div className="menu-label"><Kicker muted>sledované složky</Kicker></div>
              {watchedFolders.map((f) => (
                <div key={f} className="row" style={{ padding: "2px 4px" }}>
                  <button className="menu-item truncate" style={{ flex: 1 }} onClick={() => { void openPath(f); close(); }}>{f}</button>
                  <Button variant="plain" icon={<X size={13} />} title="Přestat sledovat" onClick={() => removeFolder(f)} />
                </div>
              ))}
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { close(); void addFolder(); }}>Přidat složku…</button>
            </>
          )}
        </Menu>
      </div>
      {!apks.length ? (
        <Card><span className="caption">Ve sledovaných složkách zatím žádné APK není. Stáhni build, objeví se tu sám.</span></Card>
      ) : (
        <div className="list">
          {apks.map((apk, i) => <ApkRow key={apkKey(apk)} apk={apk} newest={i === 0} onConfirm={setConfirm} />)}
        </div>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

export function InstallView() {
  const { reinstallMode, launchAfterInstall, autoInstall, setOption } = useInstaller();
  return (
    <>
      <div className="scroll">
        <div className="page">
          <SectionHeader
            number={tabNumber("install")}
            kicker="instalace aplikací"
            title="Pusť APK, zbytek je na mně"
            lede="Přetáhni soubor, klikni na Instalovat, nebo zapni automatiku a nech appku hlídat Stažené. Žádný terminál."
          />
          <DevicesSection />
          <DropZone />
          <div className="row wrap" style={{ gap: 20 }}>
            <Switch label="Reinstall (smaže data)" title="Před instalací aplikaci odinstaluje. Řeší konflikt podpisu i downgrade." checked={reinstallMode} onChange={(v) => setOption("reinstallMode", v)} />
            <Switch label="Po instalaci spustit" checked={launchAfterInstall} onChange={(v) => setOption("launchAfterInstall", v)} />
            <Switch label="Automaticky instalovat nová APK" title="Jakmile se ve sledované složce objeví nové APK, rovnou ho nainstaluje." checked={autoInstall} onChange={(v) => setOption("autoInstall", v)} />
          </div>
          <FailureBanner />
          <ApkSection />
        </div>
      </div>
      <LogPanel />
    </>
  );
}


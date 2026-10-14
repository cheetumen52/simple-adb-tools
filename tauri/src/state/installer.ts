import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { baseName, joinPath, native, streamToEnd, type ApkEntry } from "../lib/native";
import {
  apkVersion,
  compareVersions,
  displayName,
  isReady,
  parseBadging,
  parseDevices,
  parseDumpsysVersion,
  parseFailure,
  type ApkInfo,
  type Device,
  type FailureHint,
  type InstalledVersion,
  type VersionComparison,
} from "../lib/parse";
import { fileStamp } from "../lib/format";
import { load, save } from "../lib/storage";
import { log } from "./log";
import { useApp } from "./app";
import { toolReady, useToolchain } from "./toolchain";

export interface DeviceDetails {
  android: string;
  manufacturer: string;
  hardwareSerial: string | null;
}

type Job = { kind: "install"; files: string[]; reinstall: boolean } | { kind: "uninstall"; pkg: string };

export interface LastInstalled {
  pkg: string;
  label: string | null;
  version: string;
  file: string;
  devices: string[];
  at: number;
}

export type AppAction = "launch" | "restart" | "stop" | "settings" | "clearData";

interface InstallerState {
  devices: Device[];
  selected: string[];
  details: Record<string, DeviceDetails>;
  apks: ApkEntry[];
  info: Record<string, ApkInfo | null>;
  installed: Record<string, InstalledVersion | null>;
  running: boolean;
  currentTitle: string;
  startedAt: number | null;
  lastResult: boolean | null;
  queuedCount: number;
  failureHint: FailureHint | null;
  reinstallMode: boolean;
  watchedFolders: string[];
  autoInstall: boolean;
  launchAfterInstall: boolean;
  lastInstalled: LastInstalled | null;

  start: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  manualRefreshing: boolean;
  manualRefresh: () => Promise<void>;
  applyDevices: (devices: Device[]) => void;
  toggleSelected: (serial: string) => void;
  restartAdb: () => Promise<void>;
  screenshot: (device: Device) => Promise<void>;
  scanApks: () => Promise<void>;
  addFolder: () => Promise<void>;
  removeFolder: (path: string) => void;
  setOption: (key: "reinstallMode" | "autoInstall" | "launchAfterInstall", value: boolean) => void;
  enqueueInstall: (files: string[], reinstall: boolean) => void;
  enqueueUninstall: (pkg: string) => void;
  dismissFailure: () => void;
  appAction: (action: AppAction) => Promise<void>;
}

export const apkKey = (a: ApkEntry) => `${a.path}|${a.modifiedMs}`;
export const readyDevices = (s: Pick<InstallerState, "devices">) => s.devices.filter(isReady);
export const targets = (s: Pick<InstallerState, "devices" | "selected">) =>
  s.devices.filter((d) => isReady(d) && s.selected.includes(d.serial));
export const canInstall = (s: Pick<InstallerState, "devices" | "selected">) =>
  toolReady("adb") && (readyDevices(s).length === 0 || targets(s).length > 0);
export const apkInfo = (s: Pick<InstallerState, "info">, apk: ApkEntry) => s.info[apkKey(apk)] ?? null;

/** null while the device's installed version is still loading. */
export function comparison(
  s: Pick<InstallerState, "info" | "installed">,
  apk: ApkEntry,
  device: Device,
): { comparison: VersionComparison; installed: InstalledVersion | null } | null {
  const info = apkInfo(s, apk);
  if (!info) return null;
  const key = `${device.serial}|${info.pkg}`;
  if (!(key in s.installed)) return null;
  const installed = s.installed[key];
  return { comparison: compareVersions(info, installed), installed };
}

const queue: Job[] = [];
const known = new Set<string>();
const infoLoading = new Set<string>();
const installedLoading = new Set<string>();
let seenApks: Set<string> | null = null;
const pendingApks = new Set<string>();
let timer: number | null = null;

const get = () => useInstaller.getState();
const set = (partial: Partial<InstallerState>) => useInstaller.setState(partial);

async function adb(args: string[], timeoutMs?: number) {
  return native.run("adb", args, timeoutMs);
}

function loadDetails(device: Device) {
  set({ details: { ...get().details, [device.serial]: { android: "…", manufacturer: "", hardwareSerial: null } } });
  adb(["-s", device.serial, "shell", "getprop ro.build.version.release; getprop ro.product.manufacturer; getprop ro.serialno"], 15000)
    .then((r) => {
      const lines = r.output.split("\n").map((l) => l.trim());
      const manufacturer = lines[1] ? lines[1].charAt(0).toUpperCase() + lines[1].slice(1).toLowerCase() : "";
      set({ details: { ...get().details, [device.serial]: { android: lines[0] || "?", manufacturer, hardwareSerial: lines[2] || null } } });
    })
    .catch(() => {});
}

function loadInfo(files: ApkEntry[]) {
  if (!toolReady("aapt2")) return;
  for (const apk of files) {
    const key = apkKey(apk);
    if (key in get().info || infoLoading.has(key)) continue;
    infoLoading.add(key);
    native
      .run("aapt2", ["dump", "badging", apk.path], 30000)
      .then((r) => {
        set({ info: { ...get().info, [key]: parseBadging(r.output) } });
        loadInstalledVersions();
      })
      .finally(() => infoLoading.delete(key));
  }
}

function loadInstalledVersions() {
  const s = get();
  if (!toolReady("adb") || s.running) return;
  const packages = new Set(Object.values(s.info).filter((i): i is ApkInfo => !!i).map((i) => i.pkg));
  for (const device of readyDevices(s)) {
    for (const pkg of packages) {
      const key = `${device.serial}|${pkg}`;
      if (key in get().installed || installedLoading.has(key)) continue;
      installedLoading.add(key);
      adb(["-s", device.serial, "shell", "dumpsys", "package", pkg], 20000)
        .then((r) => set({ installed: { ...get().installed, [key]: parseDumpsysVersion(r.output, pkg) } }))
        .finally(() => installedLoading.delete(key));
    }
  }
}

function invalidateInstalled(pkg: string | null) {
  if (!pkg) return;
  const installed = { ...get().installed };
  for (const key of Object.keys(installed)) if (key.endsWith(`|${pkg}`)) delete installed[key];
  set({ installed });
}

function detectNewApks(all: ApkEntry[]) {
  if (!seenApks) {
    seenApks = new Set(all.map(apkKey));
    return;
  }
  for (const apk of all) {
    const key = apkKey(apk);
    if (seenApks.has(key)) continue;
    // Same name + mtime on two consecutive scans = download finished.
    if (!pendingApks.has(key)) {
      pendingApks.add(key);
      continue;
    }
    pendingApks.delete(key);
    seenApks.add(key);
    if (!get().autoInstall) continue;
    log("info", `Nové APK ${apk.name}, instaluji automaticky`);
    get().enqueueInstall([apk.path], get().reinstallMode);
  }
}

async function apkDetails(file: string): Promise<ApkInfo | null> {
  const cached = get().apks.find((a) => a.path === file);
  const info = cached ? apkInfo(get(), cached) : null;
  if (info) return info;
  if (!toolReady("aapt2")) return null;
  return parseBadging((await native.run("aapt2", ["dump", "badging", file], 30000)).output);
}

async function waitForTargets(): Promise<Device[] | null> {
  let t = targets(get());
  if (t.length) return t;
  // The device list may be stale (e.g. right after launch); a restart would also drop Wi‑Fi connections.
  get().applyDevices(parseDevices((await adb(["devices", "-l"], 15000)).output));
  t = targets(get());
  if (t.length) return t;
  if (readyDevices(get()).length) {
    log("error", "Žádné zařízení není vybrané. Zaškrtni telefon v seznamu.");
    return null;
  }
  log("command", "Nevidím telefon, restartuji adb…");
  await adb(["kill-server"], 15000);
  await adb(["start-server"], 30000);
  let announced = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    get().applyDevices(parseDevices((await adb(["devices", "-l"], 15000)).output));
    const found = targets(get());
    if (found.length) return found;
    if (!announced) {
      announced = true;
      const unauthorized = get().devices.some((d) => d.state === "unauthorized");
      log("info", unauthorized ? "Potvrď na telefonu „Povolit ladění USB“…" : "Čekám na připojení telefonu (max. 90 s)…");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  log("error", "Telefon se do 90 s nepřipojil.");
  return null;
}

async function installOne(device: Device, file: string, pkg: string | null, reinstall: boolean): Promise<boolean> {
  const name = baseName(file);
  const label = displayName(device);
  const out = (line: string) => log("output", line);

  if (reinstall) {
    if (pkg) {
      log("command", `adb uninstall ${pkg} → ${label}`);
      await streamToEnd("adb", ["-s", device.serial, "uninstall", pkg], out);
    } else {
      log("error", "Bez aapt2 neznám název balíčku, reinstall přeskakuji");
    }
  }

  const attempts = [["install", "-r", "-d"], ["install"], ["install", "-r", "-d"]];
  let lastOutput = "";
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) {
      log("info", `Zkouším znovu (${i + 1}/${attempts.length})…`);
      await new Promise((r) => setTimeout(r, i === 2 ? 2000 : 500));
    }
    log("command", `adb ${attempts[i].join(" ")} ${name} → ${label}`);
    const r = await streamToEnd("adb", ["-s", device.serial, ...attempts[i], file], out);
    if (r.status === 0 && r.output.includes("Success")) {
      log("success", `✓ ${name} → ${label}`);
      if (get().launchAfterInstall && pkg) {
        log("command", `Spouštím ${pkg} → ${label}`);
        await adb(["-s", device.serial, "shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"], 20000);
      }
      return true;
    }
    lastOutput = r.output;
    if (!parseFailure(lastOutput).retryable) break;
  }
  const hint = { ...parseFailure(lastOutput), file };
  set({ failureHint: hint });
  log("error", `✗ ${name} → ${label}: ${hint.message}`);
  return false;
}

async function updateBadge() {
  const pending = queue.length + (get().running ? 1 : 0);
  try {
    await getCurrentWindow().setBadgeCount(pending > 0 ? pending : undefined);
  } catch {
    // Badges are not supported on every platform.
  }
}

async function notify(ok: boolean, title: string) {
  if (document.hasFocus()) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title: ok ? "Nainstalováno ✓" : "Instalace selhala ✗", body: title });
  } catch {
    // Notifications are best effort.
  }
}

async function runJob(job: Job) {
  const title = job.kind === "install" ? job.files.map(baseName).join(", ") : job.pkg;
  set({ running: true, startedAt: Date.now(), lastResult: null, failureHint: null, currentTitle: title });
  void updateBadge();
  log("info", job.kind === "install" ? `${job.reinstall ? "Reinstall" : "Instalace"}: ${title}` : `Odinstalace: ${title}`);

  let ok = false;
  if (!toolReady("adb")) {
    log("error", "adb není k dispozici. Doinstaluj ho v Systémových požadavcích.");
    useApp.getState().setTab("requirements");
  } else {
    const devices = await waitForTargets();
    if (devices) {
      ok = true;
      if (job.kind === "install") {
        for (const file of job.files) {
          const details = await apkDetails(file);
          const pkg = details?.pkg ?? null;
          const installedOn: string[] = [];
          for (const device of devices) {
            const success = await installOne(device, file, pkg, job.reinstall);
            if (success) installedOn.push(displayName(device));
            ok = success && ok;
          }
          if (details && installedOn.length) {
            const last = { pkg: details.pkg, label: details.label, version: apkVersion(details), file, devices: installedOn, at: Date.now() };
            set({ lastInstalled: last });
            save("lastInstalled", last);
          }
          invalidateInstalled(pkg);
        }
      } else {
        for (const device of devices) {
          log("command", `adb uninstall ${job.pkg} → ${displayName(device)}`);
          const r = await streamToEnd("adb", ["-s", device.serial, "uninstall", job.pkg], (l) => log("output", l));
          ok = r.status === 0 && ok;
        }
        invalidateInstalled(job.pkg);
      }
    }
  }

  set({ running: false, currentTitle: "", startedAt: null, lastResult: ok });
  log(ok ? "success" : "error", ok ? "Hotovo" : "Selhalo");
  void updateBadge();
  void notify(ok, title);
  void get().refreshDevices();
  pump();
}

function pump() {
  if (get().running || queue.length === 0) return;
  const job = queue.shift()!;
  set({ queuedCount: queue.length });
  void runJob(job);
}

function enqueue(job: Job) {
  queue.push(job);
  set({ queuedCount: queue.length });
  void updateBadge();
  pump();
}

export const useInstaller = create<InstallerState>(() => ({
  devices: [],
  selected: [],
  details: {},
  apks: [],
  info: {},
  installed: {},
  running: false,
  currentTitle: "",
  startedAt: null,
  lastResult: null,
  queuedCount: 0,
  failureHint: null,
  reinstallMode: false,
  watchedFolders: load<string[]>("watchedFolders", []),
  autoInstall: load("autoInstall", false),
  launchAfterInstall: load("launchAfterInstall", true),
  lastInstalled: load<LastInstalled | null>("lastInstalled", null),

  start: async () => {
    if (!get().watchedFolders.length) {
      const downloads = useApp.getState().paths?.downloads;
      if (downloads) set({ watchedFolders: [downloads] });
    }
    const tick = async () => {
      await Promise.all([get().running ? Promise.resolve() : get().refreshDevices(), get().scanApks()]);
    };
    timer ??= window.setInterval(() => void tick(), 2500);
    // Resolve after the first device scan so queued "Open with" files see the connected phones.
    await tick();
  },

  manualRefreshing: false,
  /** F5 / "Obnovit": rescans devices and APKs and keeps the spinner up long enough to be noticed. */
  manualRefresh: async () => {
    if (get().manualRefreshing) return;
    set({ manualRefreshing: true });
    await Promise.all([get().refreshDevices(), get().scanApks(), new Promise((r) => setTimeout(r, 450))]);
    set({ manualRefreshing: false });
  },

  refreshDevices: async () => {
    if (!toolReady("adb")) {
      if (get().devices.length) set({ devices: [] });
      return;
    }
    const r = await adb(["devices", "-l"], 15000);
    get().applyDevices(parseDevices(r.output));
  },

  applyDevices: (devices) => {
    let selected = get().selected;
    for (const d of devices) {
      if (!known.has(d.serial)) {
        known.add(d.serial);
        selected = [...selected, d.serial];
      }
    }
    const changed = JSON.stringify(devices) !== JSON.stringify(get().devices);
    set(changed ? { devices, selected } : { selected });
    for (const d of devices) if (isReady(d) && !get().details[d.serial]) loadDetails(d);
    loadInstalledVersions();
  },

  toggleSelected: (serial) => {
    const selected = get().selected;
    set({ selected: selected.includes(serial) ? selected.filter((s) => s !== serial) : [...selected, serial] });
  },

  restartAdb: async () => {
    if (!toolReady("adb") || get().running) return;
    log("command", "adb kill-server && adb start-server");
    await adb(["kill-server"], 15000);
    await adb(["start-server"], 30000);
    log("info", "adb znovu běží");
    await get().refreshDevices();
  },

  screenshot: async (device) => {
    const desktop = useApp.getState().paths?.desktop;
    if (!desktop) return;
    const name = `${displayName(device).replaceAll(" ", "-")}_${fileStamp()}.png`;
    const path = joinPath(desktop, name);
    log("command", `adb exec-out screencap -p → ${displayName(device)}`);
    const r = await native.runToFile("adb", ["-s", device.serial, "exec-out", "screencap", "-p"], path);
    if (r.status !== 0) {
      log("error", `Screenshot selhal: ${r.output.trim()}`);
      return;
    }
    log("success", `Screenshot uložen na plochu: ${name}`);
    void openPath(path);
  },

  scanApks: async () => {
    const all = await native.listApks(get().watchedFolders, 200);
    const top = all.slice(0, 15);
    if (JSON.stringify(top) !== JSON.stringify(get().apks)) set({ apks: top });
    loadInfo(top);
    detectNewApks(all);
  },

  addFolder: async () => {
    const picked = await open({ title: "Sledovat složku s APK", directory: true, multiple: true });
    const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
    const folders = [...get().watchedFolders];
    for (const p of list) if (!folders.includes(p)) folders.push(p);
    set({ watchedFolders: folders });
    save("watchedFolders", folders);
    await get().scanApks();
  },

  removeFolder: (path) => {
    const folders = get().watchedFolders.filter((f) => f !== path);
    set({ watchedFolders: folders });
    save("watchedFolders", folders);
    void get().scanApks();
  },

  setOption: (key, value) => {
    set({ [key]: value });
    if (key !== "reinstallMode") save(key, value);
  },

  enqueueInstall: (files, reinstall) => {
    const apks = files.filter((f) => f.toLowerCase().endsWith(".apk"));
    if (!apks.length) {
      log("error", "Mezi soubory není žádné .apk");
      return;
    }
    useApp.getState().setTab("install");
    enqueue({ kind: "install", files: apks, reinstall });
  },

  enqueueUninstall: (pkg) => enqueue({ kind: "uninstall", pkg }),

  dismissFailure: () => set({ failureHint: null }),

  appAction: async (action) => {
    const last = get().lastInstalled;
    const devices = targets(get());
    if (!last || !devices.length) {
      if (!devices.length) log("error", "Žádné vybrané zařízení.");
      return;
    }
    const q = `'${last.pkg}'`;
    const launch = `monkey -p ${q} -c android.intent.category.LAUNCHER 1`;
    const commands: Record<AppAction, [string, string]> = {
      launch: ["Spouštím", launch],
      restart: ["Restartuji", `am force-stop ${q}; ${launch}`],
      stop: ["Zastavuji", `am force-stop ${q}`],
      settings: ["Otevírám nastavení", `am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d 'package:${last.pkg}'`],
      clearData: ["Mažu data", `pm clear ${q}`],
    };
    const [title, command] = commands[action];
    for (const device of devices) {
      log("command", `${title} ${last.pkg} → ${displayName(device)}`);
      const r = await adb(["-s", device.serial, "shell", command], 30000);
      const out = r.output.split("\n").filter((l) => l.trim() && !l.includes("Events injected") && !l.startsWith("  bash arg")).join("\n").trim();
      if (out) log(r.status === 0 ? "output" : "error", out);
    }
  },
}));

export function diagnostics(): string {
  const tc = useToolchain.getState();
  const describe = (s: (typeof tc)["adb"]) =>
    s.kind === "found" ? `${s.version} – ${s.path}` : s.kind === "broken" ? `nefunkční (${s.error}) – ${s.path}` : s.kind === "missing" ? "chybí" : "kontroluji";
  const { version, paths } = useApp.getState();
  const lines = [
    `Simple ADB tools ${version} (${paths?.platform ?? "?"})`,
    `${navigator.userAgent}`,
    `adb: ${describe(tc.adb)}`,
    `aapt2: ${describe(tc.aapt2)}`,
    `scrcpy: ${describe(tc.scrcpy)}`,
  ];
  const s = get();
  for (const d of s.devices) {
    const det = s.details[d.serial];
    lines.push(`zařízení: ${displayName(d)} [${d.serial}] ${d.state}${det ? ` · Android ${det.android} · ${det.manufacturer}` : ""}`);
  }
  return lines.join("\n");
}

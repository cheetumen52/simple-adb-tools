import { create } from "zustand";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { baseName, joinPath, native, streamTool } from "../lib/native";
import { displayName, isWireless, logcatLevel, packageList, sections, shQuote, type Device } from "../lib/parse";
import { fileStamp } from "../lib/format";
import { log } from "./log";
import { useApp } from "./app";
import { readyDevices, useInstaller } from "./installer";
import { useWireless } from "./wireless";
import { useTesting } from "./testing";
import { useFiles } from "./files";
import { useDeepLinks } from "./deeplinks";
import { tr } from "../i18n";
import { parseAppLocales, parseRuntimePermissions, type RuntimePermission } from "../lib/devicetools";

export type ToolsetSection = "overview" | "mirror" | "files" | "apps" | "logcat" | "crashes" | "deeplinks" | "control" | "wireless" | "testing" | "shell";
export type SectionGroup = "device" | "apps" | "testing" | "advanced";

/** Sidebar order; labels live in the translations under `toolset.sections` and `toolset.groups`. */
export const SECTION_GROUPS: { group: SectionGroup; sections: ToolsetSection[] }[] = [
  { group: "device", sections: ["overview", "mirror", "files", "control"] },
  { group: "apps", sections: ["apps", "logcat", "crashes", "deeplinks"] },
  { group: "testing", sections: ["testing", "wireless"] },
  { group: "advanced", sections: ["shell"] },
];

/** Sections that work across devices and need no device picked. */
export const DEVICELESS: ToolsetSection[] = ["wireless", "crashes"];

/** Sections whose actions can go to every connected device at once. */
export const BROADCAST: ToolsetSection[] = ["control", "deeplinks", "testing"];

export type DevToggle = "showTouches" | "pointerLocation" | "animationsOff" | "darkMode" | "stayAwake" | "layoutBounds";

/** Labels live in the translations under `toolset.developer.toggles`. */
export const DEV_TOGGLES: DevToggle[] = ["showTouches", "pointerLocation", "animationsOff", "darkMode", "stayAwake", "layoutBounds"];

export type LogLevel = "V" | "D" | "I" | "W" | "E";
export const LOG_LEVELS: [LogLevel, string][] = [["V", "Verbose"], ["D", "Debug"], ["I", "Info"], ["W", "Warning"], ["E", "Error"]];

export interface InfoRow {
  label: string;
  value: string;
}

/** Headline tiles of the overview; `fraction` drives the bar (0–1). */
export interface StatTile {
  label: string;
  value: string;
  sub: string;
  fraction: number | null;
  warn?: boolean;
}

export interface LogcatLine {
  id: number;
  level: string;
  text: string;
}

export interface ShellEntry {
  id: number;
  command: string;
  output: string;
  ok: boolean;
}

interface ToolsetState {
  serial: string | null;
  section: ToolsetSection;
  info: InfoRow[];
  stats: StatTile[];
  loadingInfo: boolean;
  packages: string[];
  systemPackages: string[];
  removedSystemPackages: string[];
  loadingPackages: boolean;
  includeSystem: boolean;
  packageQuery: string;
  selectedPackage: string | null;
  packageDetails: InfoRow[];
  packagePermissions: RuntimePermission[];
  /** null = per-app language unsupported (Android < 13). */
  packageLocales: string[] | null;
  logcat: LogcatLine[];
  logcatRunning: boolean;
  logcatLevel: LogLevel;
  logcatPackage: string;
  logcatFilter: string;
  logcatPaused: boolean;
  recordingSince: number | null;
  toggles: Partial<Record<DevToggle, boolean>>;
  shellCommand: string;
  shellHistory: ShellEntry[];
  shellRunning: boolean;
  typeText: string;
  connectHost: string;
  pairHost: string;
  pairCode: string;
  /** Send actions of broadcast sections to every ready device, not just the picked one. */
  broadcast: boolean;

  set: (partial: Partial<ToolsetState>) => void;
  setSection: (section: ToolsetSection) => void;
  deviceChanged: () => void;
  reload: () => void;
  /** Re-reads device info whose labels and values were rendered in the previous language. */
  relocalize: () => void;
  loadInfo: () => Promise<void>;
  reboot: (mode: string | null) => Promise<void>;
  push: (paths: string[]) => Promise<void>;
  loadPackages: () => Promise<void>;
  selectPackage: (pkg: string) => Promise<void>;
  setPermission: (pkg: string, names: string[], grant: boolean) => Promise<void>;
  setAppLocale: (pkg: string, locale: string | null) => Promise<void>;
  launch: (pkg: string) => void;
  forceStop: (pkg: string) => void;
  clearData: (pkg: string) => void;
  openSettings: (pkg: string) => void;
  uninstall: (pkg: string) => Promise<void>;
  restoreSystemPackage: (pkg: string) => Promise<void>;
  pullApk: (pkg: string) => Promise<void>;
  showCurrentActivity: () => void;
  startLogcat: () => Promise<void>;
  stopLogcat: () => void;
  clearLogcat: () => void;
  saveLogcat: () => Promise<void>;
  screenshot: () => void;
  toggleRecording: () => Promise<void>;
  key: (code: number, label: string) => void;
  sendText: () => void;
  openDeveloperOptions: () => void;
  switchToWifi: () => Promise<void>;
  connect: () => Promise<void>;
  pair: () => Promise<void>;
  disconnectAll: () => Promise<void>;
  loadToggles: () => Promise<void>;
  setToggle: (toggle: DevToggle, on: boolean) => Promise<void>;
  runShell: (command?: string) => Promise<void>;
}

const get = () => useToolset.getState();

export function currentDevice(serial: string | null): Device | null {
  const ready = readyDevices(useInstaller.getState());
  return ready.find((d) => d.serial === serial) ?? ready[0] ?? null;
}

const device = () => currentDevice(get().serial);
const shell = (d: Device, command: string, timeoutMs = 30000) => native.run("adb", ["-s", d.serial, "shell", command], timeoutMs);

async function adbLogged(args: string[], d?: Device | null, timeoutMs = 60000) {
  log("command", `adb ${args.join(" ")}${d ? ` → ${displayName(d)}` : ""}`);
  const r = await native.run("adb", [...(d ? ["-s", d.serial] : []), ...args], timeoutMs);
  const out = r.output.trim();
  if (out) log(r.status === 0 ? "output" : "error", out);
  return r;
}

/** The picked device, or every ready device while broadcasting in a broadcast section. */
export function targetDevices(): Device[] {
  const d = device();
  if (!d) return [];
  const s = get();
  return s.broadcast && BROADCAST.includes(s.section) ? readyDevices(useInstaller.getState()) : [d];
}

function runOnDevice(title: string, command: string) {
  for (const d of targetDevices()) {
    log("command", `${title} → ${displayName(d)}`);
    void shell(d, command).then((r) => {
      const out = r.output.trim();
      if (out) log(r.status === 0 ? "output" : "error", out);
    });
  }
}

let logcatStream: string | null = null;
let logcatBuffer: string[] = [];
let logcatTimer: number | null = null;
let logcatId = 0;
let recordStream: string | null = null;
let recordSerial: string | null = null;
let shellId = 0;
const REMOTE_RECORDING = "/sdcard/simple-adb-tools-recording.mp4";

function drainLogcat() {
  if (get().logcatPaused || !logcatBuffer.length) return;
  const lines = logcatBuffer.map((text) => ({ id: ++logcatId, level: logcatLevel(text), text }));
  logcatBuffer = [];
  const merged = [...get().logcat, ...lines];
  useToolset.setState({ logcat: merged.length > 5000 ? merged.slice(-4000) : merged });
}

async function finishRecording() {
  const serial = recordSerial;
  recordStream = null;
  recordSerial = null;
  useToolset.setState({ recordingSince: null });
  const desktop = useApp.getState().paths?.desktop;
  if (!serial || !desktop) return;
  await new Promise((r) => setTimeout(r, 1000));
  const name = `recording_${fileStamp()}.mp4`;
  const local = joinPath(desktop, name);
  const r = await native.run("adb", ["-s", serial, "pull", REMOTE_RECORDING, local], 120000);
  await native.run("adb", ["-s", serial, "shell", "rm", "-f", REMOTE_RECORDING], 15000);
  if (r.status === 0) {
    log("success", tr().toolset.logs.videoSaved(name));
    void openPath(local);
  } else {
    log("error", tr().toolset.logs.videoFailed(r.output.trim()));
  }
}

export const useToolset = create<ToolsetState>((set) => ({
  serial: null,
  section: "overview",
  info: [],
  stats: [],
  loadingInfo: false,
  packages: [],
  systemPackages: [],
  removedSystemPackages: [],
  loadingPackages: false,
  includeSystem: false,
  packageQuery: "",
  selectedPackage: null,
  packageDetails: [],
  packagePermissions: [],
  packageLocales: null,
  logcat: [],
  logcatRunning: false,
  logcatLevel: "D",
  logcatPackage: "",
  logcatFilter: "",
  logcatPaused: false,
  recordingSince: null,
  toggles: {},
  shellCommand: "",
  shellHistory: [],
  shellRunning: false,
  typeText: "",
  connectHost: "",
  pairHost: "",
  pairCode: "",
  broadcast: false,

  set: (partial) => set(partial),

  setSection: (section) => {
    set({ section });
    get().reload();
  },

  deviceChanged: () => {
    if (get().logcatRunning) get().stopLogcat();
    set({ info: [], packages: [], selectedPackage: null, packageDetails: [], toggles: {} });
    get().reload();
  },

  reload: () => {
    if (!device()) return;
    const s = get();
    if (s.section === "overview") void s.loadInfo();
    if (s.section === "apps" && !s.packages.length) void s.loadPackages();
    if (s.section === "deeplinks") void useDeepLinks.getState().loadPackages();
    if (s.section === "files") void useFiles.getState().open(useFiles.getState().path);
    if (s.section === "testing") {
      void s.loadToggles();
      void useTesting.getState().load();
    }
  },

  relocalize: () => {
    const s = get();
    if (s.info.length) void s.loadInfo();
    if (s.selectedPackage) void s.selectPackage(s.selectedPackage);
  },

  loadInfo: async () => {
    const d = device();
    if (!d) return;
    set({ loadingInfo: true });
    const script = [
      "echo @@manufacturer; getprop ro.product.manufacturer",
      "echo @@model; getprop ro.product.model",
      "echo @@release; getprop ro.build.version.release",
      "echo @@sdk; getprop ro.build.version.sdk",
      "echo @@abi; getprop ro.product.cpu.abi",
      "echo @@build; getprop ro.build.display.id",
      "echo @@size; wm size",
      "echo @@density; wm density",
      "echo @@battery; dumpsys battery",
      "echo @@storage; df -h /data | tail -1",
      "echo @@ip; ip -f inet addr show wlan0",
      "echo @@uptime; uptime",
    ].join("; ");
    const s = sections((await shell(d, script)).output);
    const last = (k: string) => s[k]?.split("\n").pop() ?? "–";
    const afterColon = (k: string) => last(k).split(":").pop()?.trim() ?? "–";
    const battery = (field: string) =>
      s.battery
        ?.split("\n")
        .find((l) => l.trim().startsWith(`${field}:`))
        ?.split(":")[1]
        ?.trim();
    const m = tr().toolset.info;
    const statusMap = m.batteryStatus;
    let batteryText = "–";
    const level = battery("level");
    if (level) {
      batteryText = `${level} %`;
      const st = battery("status");
      if (st && statusMap[st]) batteryText += ` · ${statusMap[st]}`;
      const t = Number(battery("temperature"));
      if (!Number.isNaN(t)) batteryText += ` · ${(t / 10).toFixed(1)} °C`;
    }
    // `df -h /data | tail -1`: filesystem, size, used, available, use%, mount.
    const storage = last("storage").split(/\s+/);
    const usedPct = Number(storage[4]?.replace("%", ""));
    const ip = s.ip?.match(/inet (\d+\.\d+\.\d+\.\d+)/)?.[1] ?? m.noWifi;
    const uptime = s.uptime?.match(/up ([^,]+)/)?.[1];
    const manufacturer = last("manufacturer");
    const t = tr().toolset.overview;
    set({
      loadingInfo: false,
      stats: [
        { label: m.android, value: last("release"), sub: `API ${last("sdk")}`, fraction: null },
        { label: m.battery, value: level ? `${level} %` : "–", sub: batteryText.split(" · ").slice(1).join(" · "), fraction: level ? Number(level) / 100 : null, warn: !!level && Number(level) <= 15 },
        { label: m.storage, value: storage.length >= 5 ? t.storageUsed(storage[2], storage[1]) : "–", sub: storage.length >= 4 ? m.storageFree(storage[3], storage[1]) : "", fraction: Number.isNaN(usedPct) ? null : usedPct / 100, warn: usedPct >= 90 },
        { label: t.display, value: afterColon("size").replace("x", " × "), sub: `${afterColon("density")} dpi`, fraction: null },
      ],
      info: [
        { label: m.manufacturer, value: manufacturer.charAt(0).toUpperCase() + manufacturer.slice(1).toLowerCase() },
        { label: m.model, value: last("model") },
        { label: m.abi, value: last("abi") },
        { label: m.build, value: last("build") },
        { label: m.ip, value: ip },
        { label: m.uptime, value: uptime ? tr().format.uptime(uptime) : "–" },
        { label: m.serial, value: d.serial },
      ],
    });
  },

  reboot: async (mode) => {
    const d = device();
    if (d) await adbLogged(["reboot", ...(mode ? [mode] : [])], d);
  },

  push: async (paths) => {
    const d = device();
    if (!d) return;
    for (const p of paths) {
      const r = await adbLogged(["push", p, "/sdcard/Download/"], d, 600000);
      log(r.status === 0 ? "success" : "error", r.status === 0 ? tr().toolset.logs.pushed(baseName(p)) : tr().toolset.logs.pushFailed(baseName(p)));
    }
  },

  loadPackages: async () => {
    const d = device();
    if (!d) return;
    set({ loadingPackages: true });
    const s = sections(
      (await shell(d, "echo @@all; pm list packages; echo @@third; pm list packages -3; echo @@system; pm list packages -s; echo @@everything; pm list packages -u", 60000)).output,
    );
    const all = new Set(packageList(s.all));
    const removed = packageList(s.everything).filter((p) => !all.has(p)).sort();
    const packages = (get().includeSystem ? [...all] : packageList(s.third)).sort();
    set({
      loadingPackages: false,
      systemPackages: packageList(s.system),
      removedSystemPackages: removed,
      packages,
      selectedPackage: packages.includes(get().selectedPackage ?? "") ? get().selectedPackage : null,
    });
  },

  selectPackage: async (pkg) => {
    // Re-reading the same app (after a permission or language change) keeps the old values on screen.
    if (get().selectedPackage !== pkg) set({ selectedPackage: pkg, packageDetails: [], packagePermissions: [], packageLocales: null });
    const d = device();
    if (!d) return;
    const [out, locales] = await Promise.all([
      shell(d, `dumpsys package ${shQuote(pkg)}`).then((r) => r.output),
      shell(d, `cmd locale get-app-locales ${shQuote(pkg)}`, 10000).then((r) => r.output),
    ]);
    const value = (key: string) => out.match(new RegExp(`${key}=([^\\n]+)`))?.[1]?.trim() ?? "?";
    if (get().selectedPackage !== pkg) return;
    const m = tr().toolset.info;
    set({
      packageDetails: [
        { label: m.version, value: `${value("versionName")} (${value("versionCode").split(" ")[0]})` },
        { label: m.targetSdk, value: value("targetSdk").split(" ")[0] },
        { label: m.installed, value: value("firstInstallTime") },
        { label: m.updated, value: value("lastUpdateTime") },
      ],
      packagePermissions: parseRuntimePermissions(out),
      packageLocales: parseAppLocales(locales),
    });
  },

  setPermission: async (pkg, names, grant) => {
    const d = device();
    if (!d || !names.length) return;
    log("command", `${tr().testing.logs.permission(names.map((n) => n.replace(/^android\.permission\./, "")).join(", "), grant)} → ${displayName(d)}`);
    const r = await shell(d, names.map((n) => `pm ${grant ? "grant" : "revoke"} ${shQuote(pkg)} ${n}`).join("; "));
    if (r.output.trim()) log(r.status === 0 ? "output" : "error", r.output.trim());
    if (get().selectedPackage === pkg) await get().selectPackage(pkg);
  },

  setAppLocale: async (pkg, locale) => {
    const d = device();
    if (!d) return;
    log("command", `${tr().testing.logs.appLocale(pkg, locale)} → ${displayName(d)}`);
    await shell(d, `cmd locale set-app-locales ${shQuote(pkg)}${locale ? ` --locales ${shQuote(locale)}` : ""}`);
    if (get().selectedPackage === pkg) await get().selectPackage(pkg);
  },

  launch: (pkg) => runOnDevice(`${tr().actions.launch} ${pkg}`, `monkey -p ${shQuote(pkg)} -c android.intent.category.LAUNCHER 1`),
  forceStop: (pkg) => runOnDevice(`${tr().actions.stop} ${pkg}`, `am force-stop ${shQuote(pkg)}`),
  clearData: (pkg) => runOnDevice(`${tr().actions.clearData} ${pkg}`, `pm clear ${shQuote(pkg)}`),
  openSettings: (pkg) =>
    runOnDevice(`${tr().actions.settings} ${pkg}`, `am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d ${shQuote(`package:${pkg}`)}`),

  uninstall: async (pkg) => {
    const d = device();
    if (!d) return;
    const system = get().systemPackages.includes(pkg);
    let r;
    if (system) {
      // Removes the app for the current user only; the APK stays on /system so it can be restored.
      log("command", `pm uninstall -k --user 0 ${pkg} → ${displayName(d)}`);
      r = await shell(d, `pm uninstall -k --user 0 ${shQuote(pkg)}`);
      const out = r.output.trim();
      if (out) log(r.status === 0 && out.includes("Success") ? "output" : "error", out);
    } else {
      r = await adbLogged(["uninstall", pkg], d);
    }
    if (r.status !== 0 || !r.output.includes("Success")) return;
    set({
      packages: get().packages.filter((p) => p !== pkg),
      selectedPackage: get().selectedPackage === pkg ? null : get().selectedPackage,
      removedSystemPackages: system ? [...get().removedSystemPackages, pkg].sort() : get().removedSystemPackages,
    });
    if (system) log("success", tr().toolset.logs.systemRemoved(pkg));
  },

  restoreSystemPackage: async (pkg) => {
    const d = device();
    if (!d) return;
    log("command", `cmd package install-existing ${pkg} → ${displayName(d)}`);
    const r = await shell(d, `cmd package install-existing ${shQuote(pkg)}`);
    const ok = r.status === 0 && !r.output.toLowerCase().includes("fail");
    log(ok ? "success" : "error", ok ? tr().toolset.logs.restored(pkg) : tr().toolset.logs.restoreFailed(pkg, r.output.trim()));
    await get().loadPackages();
  },

  pullApk: async (pkg) => {
    const d = device();
    const downloads = useApp.getState().paths?.downloads;
    if (!d || !downloads) return;
    const remote = packageList((await shell(d, `pm path ${shQuote(pkg)}`)).output);
    if (!remote.length) {
      log("error", tr().toolset.logs.apkPathUnknown(pkg));
      return;
    }
    let target = joinPath(downloads, `${pkg}.apk`);
    if (remote.length > 1) {
      target = joinPath(downloads, pkg);
      await native.makeDir(target);
    }
    let ok = true;
    for (const path of remote) {
      const local = remote.length > 1 ? joinPath(target, baseName(path)) : target;
      ok = (await adbLogged(["pull", path, local], d, 600000)).status === 0 && ok;
    }
    if (ok) {
      log("success", tr().toolset.logs.apkSaved(target, remote.length));
      void revealItemInDir(target);
    }
  },

  showCurrentActivity: () => runOnDevice(tr().toolset.logs.currentActivity, "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | head -2"),

  startLogcat: async () => {
    const d = device();
    if (!d || get().logcatRunning) return;
    const args = ["-s", d.serial, "logcat", "-v", "time", "-T", "300"];
    const pkg = get().logcatPackage.trim();
    if (pkg) {
      // A just-launched app needs a moment before it has a pid.
      let pid = "";
      for (let i = 0; i < 6 && (!pid || Number.isNaN(Number(pid))); i++) {
        if (i) await new Promise((r) => setTimeout(r, 500));
        pid = (await shell(d, `pidof ${shQuote(pkg)}`)).output.trim().split(" ")[0];
      }
      if (!pid || Number.isNaN(Number(pid))) {
        log("error", tr().toolset.logs.notRunning(pkg));
        return;
      }
      args.push(`--pid=${pid}`);
    }
    args.push(`*:${get().logcatLevel}`);
    logcatBuffer = [];
    try {
      logcatStream = await streamTool("adb", args, {
        onLines: (lines) => logcatBuffer.push(...lines.filter((l) => !l.startsWith("--------- beginning of"))),
        onExit: () => {
          drainLogcat();
          logcatStream = null;
          if (logcatTimer) window.clearInterval(logcatTimer);
          logcatTimer = null;
          set({ logcatRunning: false });
        },
      });
      set({ logcatRunning: true });
      logcatTimer = window.setInterval(drainLogcat, 250);
    } catch (e) {
      log("error", tr().toolset.logs.logcatFailed(String(e)));
    }
  },

  stopLogcat: () => {
    if (logcatStream) void native.stopStream(logcatStream);
  },

  clearLogcat: () => {
    set({ logcat: [] });
    const d = device();
    if (d) void native.run("adb", ["-s", d.serial, "logcat", "-c"], 15000);
  },

  saveLogcat: async () => {
    const path = await saveDialog({ defaultPath: `logcat_${fileStamp()}.txt` });
    if (!path) return;
    const q = get().logcatFilter.trim().toLowerCase();
    const lines = get().logcat.filter((l) => !q || l.text.toLowerCase().includes(q));
    await native.writeText(path, lines.map((l) => l.text).join("\n"));
  },

  screenshot: () => {
    for (const d of targetDevices()) void useInstaller.getState().screenshot(d);
  },

  toggleRecording: async () => {
    if (recordStream) {
      if (recordSerial) await native.run("adb", ["-s", recordSerial, "shell", "pkill", "-INT", "screenrecord"], 15000);
      return;
    }
    const d = device();
    if (!d) return;
    try {
      recordStream = await streamTool("adb", ["-s", d.serial, "shell", "screenrecord", "--bit-rate", "8000000", REMOTE_RECORDING], {
        onExit: () => void finishRecording(),
      });
      recordSerial = d.serial;
      set({ recordingSince: Date.now() });
      log("command", `adb shell screenrecord → ${displayName(d)} (max. 3 min)`);
    } catch (e) {
      log("error", tr().toolset.logs.recordingFailed(String(e)));
    }
  },

  key: (code, label) => runOnDevice(tr().toolset.logs.key(label), `input keyevent ${code}`),

  sendText: () => {
    const text = get().typeText;
    if (!text) return;
    runOnDevice(tr().toolset.logs.typing, `input text ${shQuote(text.replaceAll(" ", "%s"))}`);
    set({ typeText: "" });
  },

  openDeveloperOptions: () => runOnDevice(tr().toolset.logs.developerOptions, "am start -a android.settings.APPLICATION_DEVELOPMENT_SETTINGS"),

  switchToWifi: async () => {
    const d = device();
    if (!d) return;
    const ip = (await shell(d, "ip -f inet addr show wlan0")).output.match(/inet (\d+\.\d+\.\d+\.\d+)/)?.[1];
    if (!ip) {
      log("error", tr().toolset.logs.noWifi);
      return;
    }
    await adbLogged(["tcpip", "5555"], d);
    await new Promise((r) => setTimeout(r, 2000));
    if (await useWireless.getState().connect(`${ip}:5555`)) log("success", tr().toolset.logs.switchedToWifi(`${ip}:5555`));
    void useInstaller.getState().refreshDevices();
  },

  connect: async () => {
    const host = get().connectHost.trim();
    if (!host) return;
    if (await useWireless.getState().connect(host.includes(":") ? host : `${host}:5555`)) log("success", tr().toolset.logs.connected);
    void useInstaller.getState().refreshDevices();
  },

  pair: async () => {
    const host = get().pairHost.trim();
    const code = get().pairCode.trim();
    if (!host || !code) return;
    let r = await adbLogged(["pair", host, code]);
    const [ip, portText] = host.split(":");
    if (!r.output.toLowerCase().includes("success") && Number(portText)) {
      if ((await useWireless.getState().diagnose(ip, Number(portText))) === "reachable") r = await adbLogged(["pair", host, code]);
    }
    if (!r.output.toLowerCase().includes("success")) return;
    set({ pairCode: "" });
    log("success", tr().toolset.logs.paired);
    // The connect port differs from the pairing port; mDNS advertises it shortly after pairing.
    for (let i = 0; i < 5; i++) {
      await new Promise((res) => setTimeout(res, 1500));
      const services = (await native.run("adb", ["mdns", "services"], 10000)).output;
      const line = services.split("\n").find((l) => l.includes("_adb-tls-connect") && l.includes(ip));
      const addr = line?.trim().split(/\s+/).pop();
      if (addr) {
        await useWireless.getState().connect(addr);
        void useInstaller.getState().refreshDevices();
        return;
      }
    }
    log("info", tr().toolset.logs.pairNotFound);
  },

  disconnectAll: async () => {
    useWireless.getState().pauseAll();
    await adbLogged(["disconnect"]);
    void useInstaller.getState().refreshDevices();
  },

  loadToggles: async () => {
    const d = device();
    if (!d) return;
    const script = [
      "echo @@touches; settings get system show_touches",
      "echo @@pointer; settings get system pointer_location",
      "echo @@anim; settings get global window_animation_scale",
      "echo @@night; cmd uimode night",
      "echo @@stay; settings get global stay_on_while_plugged_in",
      "echo @@layout; getprop debug.layout",
    ].join("; ");
    const s = sections((await shell(d, script)).output);
    const anim = s.anim ?? "1";
    set({
      toggles: {
        showTouches: s.touches === "1",
        pointerLocation: s.pointer === "1",
        animationsOff: anim === "0" || anim === "0.0",
        darkMode: (s.night ?? "").toLowerCase().includes("yes"),
        stayAwake: !["0", "", "null"].includes(s.stay ?? "0"),
        layoutBounds: s.layout === "true",
      },
    });
  },

  setToggle: async (toggle, on) => {
    const d = device();
    if (!d) return;
    set({ toggles: { ...get().toggles, [toggle]: on } });
    const commands: Record<DevToggle, string> = {
      showTouches: `settings put system show_touches ${on ? 1 : 0}`,
      pointerLocation: `settings put system pointer_location ${on ? 1 : 0}`,
      animationsOff: ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]
        .map((k) => `settings put global ${k} ${on ? 0 : 1}`)
        .join("; "),
      darkMode: `cmd uimode night ${on ? "yes" : "no"}`,
      stayAwake: `svc power stayon ${on ? "true" : "false"}`,
      layoutBounds: `setprop debug.layout ${on ? "true" : "false"}; service call activity 1599295570 > /dev/null`,
    };
    const m = tr().toolset.developer;
    await Promise.all(
      targetDevices().map(async (target) => {
        log("command", `${m.toggles[toggle].title}: ${on ? m.on : m.off} → ${displayName(target)}`);
        const r = await shell(target, commands[toggle]);
        if (r.status !== 0) log("error", r.output.trim());
      }),
    );
    await get().loadToggles();
  },

  runShell: async (command) => {
    const cmd = (command ?? get().shellCommand).trim();
    const d = device();
    if (!d || !cmd || get().shellRunning) return;
    set({ shellRunning: true });
    const r = await shell(d, cmd, 120000);
    const history = [...get().shellHistory, { id: ++shellId, command: cmd, output: r.output.replace(/\n+$/, ""), ok: r.status === 0 }].slice(-60);
    set({ shellHistory: history, shellRunning: false, ...(command ? {} : { shellCommand: "" }) });
  },
}));

export const wirelessDevicePresent = () => useInstaller.getState().devices.some(isWireless);

import { create } from "zustand";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { baseName, joinPath, native, streamTool } from "../lib/native";
import { czechUptime, displayName, isWireless, logcatLevel, packageList, sections, shQuote, type Device } from "../lib/parse";
import { fileStamp } from "../lib/format";
import { load, save } from "../lib/storage";
import { log } from "./log";
import { useApp } from "./app";
import { readyDevices, useInstaller } from "./installer";
import { useWireless } from "./wireless";

export type ToolsetSection = "overview" | "mirror" | "apps" | "logcat" | "control" | "wireless" | "developer" | "shell";

export const SECTIONS: { id: ToolsetSection; title: string }[] = [
  { id: "overview", title: "Přehled" },
  { id: "mirror", title: "Zrcadlení" },
  { id: "apps", title: "Aplikace" },
  { id: "logcat", title: "Logcat" },
  { id: "control", title: "Ovládání" },
  { id: "wireless", title: "Wi‑Fi" },
  { id: "developer", title: "Vývojář" },
  { id: "shell", title: "Shell" },
];

export type DevToggle = "showTouches" | "pointerLocation" | "animationsOff" | "darkMode" | "stayAwake" | "layoutBounds";

export const DEV_TOGGLES: { id: DevToggle; title: string; help: string }[] = [
  { id: "showTouches", title: "Zobrazovat dotyky", help: "Kolečko v místě každého dotyku. Ideální pro nahrávání videí a demo." },
  { id: "pointerLocation", title: "Poloha ukazatele", help: "Souřadnice dotyku a stopa pohybu v horní liště." },
  { id: "animationsOff", title: "Vypnout animace", help: "Nastaví všechna měřítka animací na 0. Rychlejší UI testy, méně flaky." },
  { id: "darkMode", title: "Tmavý režim", help: "Přepne systémový tmavý vzhled. Rychlý test dark mode." },
  { id: "stayAwake", title: "Nezhasínat při nabíjení", help: "Displej nezhasne, dokud je telefon na kabelu." },
  { id: "layoutBounds", title: "Hranice layoutu", help: "Vykreslí okraje a marginy všech view. Projeví se po přepnutí aplikace." },
];

export type LogLevel = "V" | "D" | "I" | "W" | "E";
export const LOG_LEVELS: [LogLevel, string][] = [["V", "Verbose"], ["D", "Debug"], ["I", "Info"], ["W", "Warning"], ["E", "Error"]];

export interface InfoRow {
  label: string;
  value: string;
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
  loadingInfo: boolean;
  packages: string[];
  systemPackages: string[];
  removedSystemPackages: string[];
  loadingPackages: boolean;
  includeSystem: boolean;
  packageQuery: string;
  selectedPackage: string | null;
  packageDetails: InfoRow[];
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
  deepLink: string;
  deepLinkHistory: string[];
  connectHost: string;
  pairHost: string;
  pairCode: string;

  set: (partial: Partial<ToolsetState>) => void;
  setSection: (section: ToolsetSection) => void;
  deviceChanged: () => void;
  reload: () => void;
  loadInfo: () => Promise<void>;
  reboot: (mode: string | null) => Promise<void>;
  push: (paths: string[]) => Promise<void>;
  loadPackages: () => Promise<void>;
  selectPackage: (pkg: string) => Promise<void>;
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
  openDeepLink: (link?: string) => void;
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

function runOnDevice(title: string, command: string) {
  const d = device();
  if (!d) return;
  log("command", `${title} → ${displayName(d)}`);
  void shell(d, command).then((r) => {
    const out = r.output.trim();
    if (out) log(r.status === 0 ? "output" : "error", out);
  });
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
    log("success", `✓ Video uloženo na plochu: ${name}`);
    void openPath(local);
  } else {
    log("error", `Video se nepodařilo stáhnout: ${r.output.trim()}`);
  }
}

export const useToolset = create<ToolsetState>((set) => ({
  serial: null,
  section: "overview",
  info: [],
  loadingInfo: false,
  packages: [],
  systemPackages: [],
  removedSystemPackages: [],
  loadingPackages: false,
  includeSystem: false,
  packageQuery: "",
  selectedPackage: null,
  packageDetails: [],
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
  deepLink: "",
  deepLinkHistory: load<string[]>("deepLinkHistory", []),
  connectHost: "",
  pairHost: "",
  pairCode: "",

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
    if (s.section === "developer") void s.loadToggles();
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
    const statusMap: Record<string, string> = { "1": "neznámý", "2": "nabíjí se", "3": "vybíjí se", "4": "nenabíjí", "5": "nabito" };
    let batteryText = "–";
    const level = battery("level");
    if (level) {
      batteryText = `${level} %`;
      const st = battery("status");
      if (st && statusMap[st]) batteryText += ` · ${statusMap[st]}`;
      const t = Number(battery("temperature"));
      if (!Number.isNaN(t)) batteryText += ` · ${(t / 10).toFixed(1)} °C`;
    }
    const storage = last("storage").split(/\s+/);
    const ip = s.ip?.match(/inet (\d+\.\d+\.\d+\.\d+)/)?.[1] ?? "nepřipojeno k Wi‑Fi";
    const uptime = s.uptime?.match(/up ([^,]+)/)?.[1];
    const manufacturer = last("manufacturer");
    set({
      loadingInfo: false,
      info: [
        { label: "Výrobce", value: manufacturer.charAt(0).toUpperCase() + manufacturer.slice(1).toLowerCase() },
        { label: "Model", value: last("model") },
        { label: "Android", value: `${last("release")} (API ${last("sdk")})` },
        { label: "Procesor (ABI)", value: last("abi") },
        { label: "Build", value: last("build") },
        { label: "Rozlišení", value: afterColon("size") },
        { label: "Hustota", value: `${afterColon("density")} dpi` },
        { label: "Baterie", value: batteryText },
        { label: "Úložiště", value: storage.length >= 4 ? `volno ${storage[3]} z ${storage[1]}` : "–" },
        { label: "IP adresa", value: ip },
        { label: "Zapnuto", value: uptime ? czechUptime(uptime) : "–" },
        { label: "Sériové číslo", value: d.serial },
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
      log(r.status === 0 ? "success" : "error", r.status === 0 ? `✓ ${baseName(p)} je v telefonu ve složce Download` : `✗ ${baseName(p)} se nepodařilo nahrát`);
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
    set({ selectedPackage: pkg, packageDetails: [] });
    const d = device();
    if (!d) return;
    const out = (await shell(d, `dumpsys package ${shQuote(pkg)}`)).output;
    const value = (key: string) => out.match(new RegExp(`${key}=([^\\n]+)`))?.[1]?.trim() ?? "?";
    if (get().selectedPackage !== pkg) return;
    set({
      packageDetails: [
        { label: "Verze", value: `${value("versionName")} (${value("versionCode").split(" ")[0]})` },
        { label: "Target SDK", value: value("targetSdk").split(" ")[0] },
        { label: "Nainstalováno", value: value("firstInstallTime") },
        { label: "Aktualizováno", value: value("lastUpdateTime") },
      ],
    });
  },

  launch: (pkg) => runOnDevice(`Spouštím ${pkg}`, `monkey -p ${shQuote(pkg)} -c android.intent.category.LAUNCHER 1`),
  forceStop: (pkg) => runOnDevice(`Zastavuji ${pkg}`, `am force-stop ${shQuote(pkg)}`),
  clearData: (pkg) => runOnDevice(`Mažu data ${pkg}`, `pm clear ${shQuote(pkg)}`),
  openSettings: (pkg) =>
    runOnDevice(`Otevírám nastavení ${pkg}`, `am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d ${shQuote(`package:${pkg}`)}`),

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
    if (system) log("success", `✓ Systémová aplikace ${pkg} odebrána. Vrátit ji jde přes „Obnovit odebrané“.`);
  },

  restoreSystemPackage: async (pkg) => {
    const d = device();
    if (!d) return;
    log("command", `cmd package install-existing ${pkg} → ${displayName(d)}`);
    const r = await shell(d, `cmd package install-existing ${shQuote(pkg)}`);
    const ok = r.status === 0 && !r.output.toLowerCase().includes("fail");
    log(ok ? "success" : "error", ok ? `✓ ${pkg} je zpět` : `Obnovení ${pkg} selhalo: ${r.output.trim()}`);
    await get().loadPackages();
  },

  pullApk: async (pkg) => {
    const d = device();
    const downloads = useApp.getState().paths?.downloads;
    if (!d || !downloads) return;
    const remote = packageList((await shell(d, `pm path ${shQuote(pkg)}`)).output);
    if (!remote.length) {
      log("error", `Cestu k APK pro ${pkg} se nepodařilo zjistit`);
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
      log("success", `✓ APK uloženo: ${target}${remote.length > 1 ? ` (split APK, ${remote.length} souborů)` : ""}`);
      void revealItemInDir(target);
    }
  },

  showCurrentActivity: () => runOnDevice("Aktuální aktivita", "dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | head -2"),

  startLogcat: async () => {
    const d = device();
    if (!d || get().logcatRunning) return;
    const args = ["-s", d.serial, "logcat", "-v", "time", "-T", "300"];
    const pkg = get().logcatPackage.trim();
    if (pkg) {
      const pid = (await shell(d, `pidof ${shQuote(pkg)}`)).output.trim().split(" ")[0];
      if (!pid || Number.isNaN(Number(pid))) {
        log("error", `${pkg} neběží. Spusť aplikaci a zkus to znovu.`);
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
      log("error", `Logcat nejde spustit: ${String(e)}`);
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
    const d = device();
    if (d) void useInstaller.getState().screenshot(d);
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
      log("error", `Nahrávání nejde spustit: ${String(e)}`);
    }
  },

  key: (code, label) => runOnDevice(`Klávesa ${label}`, `input keyevent ${code}`),

  sendText: () => {
    const text = get().typeText;
    if (!text) return;
    runOnDevice("Píšu text", `input text ${shQuote(text.replaceAll(" ", "%s"))}`);
    set({ typeText: "" });
  },

  openDeepLink: (link) => {
    const url = (link ?? get().deepLink).trim();
    if (!url) return;
    runOnDevice(`Otevírám ${url}`, `am start -W -a android.intent.action.VIEW -d ${shQuote(url)}`);
    const history = [url, ...get().deepLinkHistory.filter((h) => h !== url)].slice(0, 8);
    set({ deepLinkHistory: history });
    save("deepLinkHistory", history);
  },

  openDeveloperOptions: () => runOnDevice("Možnosti pro vývojáře", "am start -a android.settings.APPLICATION_DEVELOPMENT_SETTINGS"),

  switchToWifi: async () => {
    const d = device();
    if (!d) return;
    const ip = (await shell(d, "ip -f inet addr show wlan0")).output.match(/inet (\d+\.\d+\.\d+\.\d+)/)?.[1];
    if (!ip) {
      log("error", "Telefon není připojený k Wi‑Fi.");
      return;
    }
    await adbLogged(["tcpip", "5555"], d);
    await new Promise((r) => setTimeout(r, 2000));
    if (await useWireless.getState().connect(`${ip}:5555`)) log("success", `✓ Připojeno přes Wi‑Fi (${ip}:5555). Kabel můžeš odpojit.`);
    void useInstaller.getState().refreshDevices();
  },

  connect: async () => {
    const host = get().connectHost.trim();
    if (!host) return;
    if (await useWireless.getState().connect(host.includes(":") ? host : `${host}:5555`)) log("success", "✓ Připojeno přes Wi‑Fi");
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
    log("success", "✓ Spárováno, hledám telefon v síti…");
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
    log("info", "Telefon se v síti neohlásil. Připoj se ručně přes IP adresu a port z obrazovky Bezdrátové ladění.");
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
    const title = DEV_TOGGLES.find((t) => t.id === toggle)!.title;
    log("command", `${title}: ${on ? "zapnuto" : "vypnuto"} → ${displayName(d)}`);
    const r = await shell(d, commands[toggle]);
    if (r.status !== 0) log("error", r.output.trim());
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

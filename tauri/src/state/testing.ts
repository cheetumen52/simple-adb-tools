import { create } from "zustand";
import { native } from "../lib/native";
import { parseBattery, parseDensity, parseFlag, parseProxy, reversePort, type BatteryState, type Density } from "../lib/devicetools";
import { displayName, sections, type Device } from "../lib/parse";
import { load, save } from "../lib/storage";
import { tr } from "../i18n";
import { log } from "./log";
import { currentDevice, useToolset } from "./toolset";

export type BatteryAction = "low" | "unplug" | "charging" | "full" | "doze" | "reset";

interface TestingState {
  loadedFor: string | null;
  loading: boolean;
  proxy: string | null;
  fontScale: number | null;
  density: Density | null;
  battery: BatteryState | null;
  airplane: boolean | null;
  wifi: boolean | null;
  data: boolean | null;
  sdk: number | null;
  locales: string | null;
  proxyPort: string;
  localIps: string[];

  setPort: (port: string) => void;
  load: () => Promise<void>;
  proxyViaAdb: () => Promise<void>;
  proxyViaLan: (host: string) => Promise<void>;
  clearProxy: () => Promise<void>;
  setFontScale: (scale: number) => Promise<void>;
  setDensity: (dpi: number | null) => Promise<void>;
  batteryAction: (action: BatteryAction) => Promise<void>;
  setAirplane: (on: boolean) => Promise<void>;
  setWifi: (on: boolean) => Promise<void>;
  setData: (on: boolean) => Promise<void>;
  openLocaleSettings: () => Promise<void>;
}

export const FONT_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 2];

const BATTERY_COMMANDS: Record<BatteryAction, string> = {
  low: "dumpsys battery unplug; dumpsys battery set level 5",
  unplug: "dumpsys battery unplug",
  charging: "dumpsys battery set ac 1; dumpsys battery set status 2",
  full: "dumpsys battery set level 100; dumpsys battery set status 5",
  doze: "dumpsys battery unplug; dumpsys deviceidle force-idle",
  reset: "dumpsys deviceidle unforce; dumpsys battery reset",
};

const device = () => currentDevice(useToolset.getState().serial);
const get = () => useTesting.getState();

async function shell(d: Device, title: string, command: string) {
  log("command", `${title} → ${displayName(d)}`);
  const r = await native.run("adb", ["-s", d.serial, "shell", command], 30000);
  const out = r.output.trim();
  if (out && r.status !== 0) log("error", out);
  return r;
}

/** Runs a change on the current device, then re-reads the state. */
async function change(title: string, command: string) {
  const d = device();
  if (!d) return;
  await shell(d, title, command);
  await get().load();
}

// `wifi_on`: 0 off, 1 on, 2 on while in airplane mode, 3 off but scanning.
const wifiOn = (v: string | undefined) => (v === "1" || v === "2" ? true : v === "0" || v === "3" ? false : null);

export const useTesting = create<TestingState>((set) => ({
  loadedFor: null,
  loading: false,
  proxy: null,
  fontScale: null,
  density: null,
  battery: null,
  airplane: null,
  wifi: null,
  data: null,
  sdk: null,
  locales: null,
  proxyPort: load("proxyPort", "8888"),
  localIps: [],

  setPort: (proxyPort) => {
    set({ proxyPort });
    save("proxyPort", proxyPort);
  },

  load: async () => {
    const d = device();
    if (!d) return;
    set({ loading: true });
    const script = [
      "echo @@proxy; settings get global http_proxy",
      "echo @@font; settings get system font_scale",
      "echo @@density; wm density",
      "echo @@battery; dumpsys battery",
      "echo @@airplane; settings get global airplane_mode_on",
      "echo @@wifi; settings get global wifi_on",
      "echo @@data; settings get global mobile_data",
      "echo @@sdk; getprop ro.build.version.sdk",
      "echo @@locales; settings get system system_locales",
    ].join("; ");
    const [r, localIps] = await Promise.all([native.run("adb", ["-s", d.serial, "shell", script], 20000), native.localIps().catch(() => [])]);
    const s = sections(r.output);
    const locales = (s.locales ?? "").trim();
    set({
      loading: false,
      loadedFor: d.serial,
      proxy: parseProxy(s.proxy ?? ""),
      fontScale: Number(s.font) || 1,
      density: parseDensity(s.density ?? ""),
      battery: parseBattery(s.battery ?? ""),
      airplane: parseFlag(s.airplane),
      wifi: wifiOn(s.wifi?.trim()),
      data: parseFlag(s.data),
      sdk: Number(s.sdk) || null,
      locales: locales && locales !== "null" ? locales : null,
      localIps,
    });
  },

  proxyViaAdb: async () => {
    const d = device();
    const port = Number(get().proxyPort);
    if (!d || !port) return;
    // The phone talks to its own localhost; adb tunnels it to the proxy on this computer, over USB or Wi‑Fi alike.
    log("command", `adb reverse tcp:${port} tcp:${port} → ${displayName(d)}`);
    const r = await native.run("adb", ["-s", d.serial, "reverse", `tcp:${port}`, `tcp:${port}`], 15000);
    if (r.status !== 0) {
      log("error", r.output.trim());
      return;
    }
    await change(tr().testing.logs.proxy(`127.0.0.1:${port}`), `settings put global http_proxy 127.0.0.1:${port}`);
  },

  proxyViaLan: async (host) => {
    const port = Number(get().proxyPort);
    if (!host || !port) return;
    await change(tr().testing.logs.proxy(`${host}:${port}`), `settings put global http_proxy ${host}:${port}`);
  },

  clearProxy: async () => {
    const d = device();
    if (!d) return;
    const port = reversePort(get().proxy);
    await shell(d, tr().testing.logs.proxyOff, "settings put global http_proxy :0");
    if (port) await native.run("adb", ["-s", d.serial, "reverse", "--remove", `tcp:${port}`], 15000);
    await get().load();
  },

  setFontScale: (scale) => change(tr().testing.logs.fontScale(scale), `settings put system font_scale ${scale}`),

  setDensity: (dpi) => change(tr().testing.logs.density(dpi), dpi ? `wm density ${dpi}` : "wm density reset"),

  batteryAction: (action) => change(tr().testing.battery[action], BATTERY_COMMANDS[action]),

  setAirplane: (on) => change(tr().testing.logs.airplane(on), `cmd connectivity airplane-mode ${on ? "enable" : "disable"}`),

  setWifi: (on) => change(tr().testing.logs.wifi(on), `svc wifi ${on ? "enable" : "disable"}`),

  setData: (on) => change(tr().testing.logs.data(on), `svc data ${on ? "enable" : "disable"}`),

  openLocaleSettings: async () => {
    const d = device();
    if (d) await shell(d, tr().testing.languageSettings, "am start -a android.settings.LOCALE_SETTINGS");
  },
}));

import { create } from "zustand";
import { openUrl } from "@tauri-apps/plugin-opener";
import { native, type ProbeResult } from "../lib/native";
import { displayName, isReady, isWireless } from "../lib/parse";
import { load, save } from "../lib/storage";
import { log } from "./log";
import { useApp } from "./app";
import { useInstaller } from "./installer";
import { toolReady } from "./toolchain";

export interface KnownWireless {
  address: string;
  name: string;
  hardwareSerial: string | null;
  lastConnected: number;
}

export type WirelessState = "connected" | "reconnecting" | "waiting" | "unreachable" | "paused" | "disconnected";

export const knownId = (k: KnownWireless) => k.hardwareSerial ?? k.address;

interface WirelessStore {
  known: KnownWireless[];
  autoReconnect: boolean;
  states: Record<string, WirelessState>;
  localNetworkBlocked: boolean;
  setAutoReconnect: (on: boolean) => void;
  reconnect: (k: KnownWireless, manual: boolean) => Promise<void>;
  connect: (address: string, opts?: { verbose?: boolean; allowServerRestart?: boolean }) => Promise<boolean>;
  diagnose: (host: string, port: number, opts?: { verbose?: boolean; allowServerRestart?: boolean }) => Promise<ProbeResult>;
  forget: (k: KnownWireless) => void;
  pauseAll: () => void;
  openLocalNetworkSettings: () => void;
  start: () => void;
}

/** ~4 min of retries (5, 10, 20, 40, 60, 60… s) before auto-reconnect gives up. */
const MAX_FAILURES = 8;
const failures = new Map<string, number>();
const nextAttempt = new Map<string, number>();
const inFlight = new Set<string>();
const paused = new Set<string>();
let restartedServerForLAN = false;
let timer: number | null = null;

const get = () => useWireless.getState();

function connectedDevice(k: KnownWireless) {
  const { devices, details } = useInstaller.getState();
  return devices.find((d) => {
    if (!isReady(d) || !isWireless(d)) return false;
    if (d.serial === k.address) return true;
    return !!k.hardwareSerial && details[d.serial]?.hardwareSerial === k.hardwareSerial;
  });
}

export function wirelessStatus(k: KnownWireless): WirelessState {
  if (connectedDevice(k)) return "connected";
  const id = knownId(k);
  if (paused.has(id)) return "paused";
  const state = get().states[id];
  if (state && state !== "connected") return state;
  return get().autoReconnect ? "waiting" : "disconnected";
}

export const reconnectingDevices = () =>
  get().autoReconnect ? get().known.filter((k) => ["reconnecting", "waiting"].includes(wirelessStatus(k))) : [];

function setKnown(known: KnownWireless[]) {
  useWireless.setState({ known });
  save("knownWireless", known);
}

function setState(id: string, state: WirelessState) {
  useWireless.setState({ states: { ...get().states, [id]: state } });
}

function markConnected(k: KnownWireless) {
  const id = knownId(k);
  failures.set(id, 0);
  nextAttempt.delete(id);
  if (get().states[id] !== "connected") setState(id, "connected");
}

/** Adds or refreshes every wireless device that is currently online. */
function record() {
  const { devices, details } = useInstaller.getState();
  let known = get().known;
  let changed = false;
  for (const d of devices) {
    if (!isReady(d) || !isWireless(d)) continue;
    const hw = details[d.serial]?.hardwareSerial ?? null;
    const idx = known.findIndex((k) => (k.hardwareSerial && k.hardwareSerial === hw) || k.address === d.serial);
    if (idx >= 0) {
      const k = known[idx];
      if (k.address !== d.serial || k.name !== displayName(d) || (!k.hardwareSerial && hw)) {
        known = known.map((x, i) => (i === idx ? { ...x, address: d.serial, name: displayName(d), hardwareSerial: x.hardwareSerial ?? hw, lastConnected: Date.now() } : x));
        changed = true;
      }
      markConnected(known[idx]);
    } else if (hw || !d.serial.includes("._adb-tls-")) {
      const k = { address: d.serial, name: displayName(d), hardwareSerial: hw, lastConnected: Date.now() };
      known = [...known, k];
      changed = true;
      markConnected(k);
    }
  }
  if (changed) setKnown(known);
}

function tick() {
  if (!toolReady("adb")) return;
  record();
  if (!get().autoReconnect) return;
  const now = Date.now();
  for (const k of get().known) {
    const id = knownId(k);
    if (connectedDevice(k) || paused.has(id) || inFlight.has(id)) continue;
    if ((failures.get(id) ?? 0) >= MAX_FAILURES || (nextAttempt.get(id) ?? 0) > now) continue;
    void get().reconnect(k, false);
  }
}

export const useWireless = create<WirelessStore>(() => ({
  known: load<KnownWireless[]>("knownWireless", []),
  autoReconnect: load("autoReconnect", true),
  states: {},
  localNetworkBlocked: false,

  setAutoReconnect: (on) => {
    useWireless.setState({ autoReconnect: on });
    save("autoReconnect", on);
  },

  start: () => {
    timer ??= window.setInterval(tick, 4000);
  },

  reconnect: async (k, manual) => {
    const id = knownId(k);
    if (inFlight.has(id)) return;
    if (manual) {
      paused.delete(id);
      failures.set(id, 0);
    } else if ((failures.get(id) ?? 0) === 0) {
      log("info", `Wi‑Fi spojení s ${k.name} spadlo, obnovuji…`);
    }
    inFlight.add(id);
    setState(id, "reconnecting");

    let target = k.address;
    // Android 11+ wireless debugging picks a new port each time; mDNS tells us the current one.
    if (k.hardwareSerial) {
      const services = (await native.run("adb", ["mdns", "services"], 10000)).output;
      for (const line of services.split("\n")) {
        if (line.includes(k.hardwareSerial) && line.includes("_adb-tls-connect")) {
          const addr = line.trim().split(/\s+/).pop();
          if (addr?.includes(":")) target = addr;
        }
      }
    }
    if (useInstaller.getState().devices.some((d) => d.serial === target && !isReady(d))) {
      await native.run("adb", ["disconnect", target], 10000);
    }
    const ok = await get().connect(target, { verbose: manual, allowServerRestart: manual || !restartedServerForLAN });
    inFlight.delete(id);

    if (ok) {
      setKnown(get().known.map((x) => (knownId(x) === id ? { ...x, address: target } : x)));
      markConnected(k);
      log("success", `✓ ${k.name} znovu připojeno přes Wi‑Fi (${target})`);
      void useInstaller.getState().refreshDevices();
      return;
    }
    const count = (failures.get(id) ?? 0) + 1;
    failures.set(id, count);
    nextAttempt.set(id, Date.now() + Math.min(60, 5 * 2 ** (count - 1)) * 1000);
    if (count >= MAX_FAILURES) {
      setState(id, "unreachable");
      log("error", `${k.name} není přes Wi‑Fi dostupné. Automatické obnovení jsem zastavil, zkus „Znovu připojit“.`);
    } else {
      setState(id, "waiting");
    }
  },

  connect: async (address, opts = {}) => {
    const verbose = opts.verbose ?? true;
    const allowServerRestart = opts.allowServerRestart ?? true;
    if (verbose) log("command", `adb connect ${address}`);
    let r = await native.run("adb", ["connect", address], 30000);
    if (r.output.includes("connected to")) {
      useWireless.setState({ localNetworkBlocked: false });
      return true;
    }
    const [host, portText] = address.split(":");
    const port = Number(portText);
    if (!host || !port) {
      if (verbose) log("error", r.output.trim());
      return false;
    }
    const probe = await get().diagnose(host, port, { verbose, allowServerRestart });
    if (probe === "reachable" && allowServerRestart) {
      r = await native.run("adb", ["connect", address], 30000);
      if (r.output.includes("connected to")) {
        useWireless.setState({ localNetworkBlocked: false });
        log("success", `✓ Připojeno přes Wi‑Fi (${address})`);
        void useInstaller.getState().refreshDevices();
        return true;
      }
      if (verbose) log("error", r.output.trim());
    }
    return false;
  },

  /**
   * Probes the phone from the app itself. "reachable" means the adb server was spawned by a process
   * without Local Network access, so it is restarted under this app; other outcomes are explained.
   */
  diagnose: async (host, port, opts = {}) => {
    const verbose = opts.verbose ?? true;
    const result = await native.probeTcp(host, port, 4000);
    switch (result) {
      case "reachable":
        if (opts.allowServerRestart ?? true) {
          restartedServerForLAN = true;
          log("info", "Telefon je v síti dostupný, ale adb server do ní nesmí. Restartuji adb server pod Simple ADB tools…");
          await native.run("adb", ["kill-server"], 15000);
          await native.run("adb", ["start-server"], 30000);
        }
        break;
      case "blocked":
        useWireless.setState({ localNetworkBlocked: true });
        log(
          "error",
          useApp.getState().paths?.platform === "macos"
            ? "macOS blokuje Simple ADB tools přístup do místní sítě. Povol ho v Nastavení → Soukromí a zabezpečení → Místní síť."
            : "K telefonu nevede cesta. Zkontroluj, že je ve stejné síti a že spojení neblokuje firewall.",
        );
        break;
      case "refused":
        useWireless.setState({ localNetworkBlocked: false });
        if (verbose)
          log("error", `Telefon ${host} na portu ${port} neposlouchá. Android 10 a starší: připoj kabel a dej „Přepnout na Wi‑Fi“. Android 11+: zkontroluj port na obrazovce Bezdrátové ladění.`);
        break;
      case "timeout":
        if (verbose) log("error", `Telefon ${host} neodpovídá. Je zapnutý a ve stejné Wi‑Fi síti jako počítač?`);
        break;
    }
    return result;
  },

  forget: (k) => {
    const id = knownId(k);
    setKnown(get().known.filter((x) => knownId(x) !== id));
    failures.delete(id);
    paused.delete(id);
    const states = { ...get().states };
    delete states[id];
    useWireless.setState({ states });
  },

  /** An explicit "disconnect all" wins over auto-reconnect. */
  pauseAll: () => {
    const states = { ...get().states };
    for (const k of get().known) {
      paused.add(knownId(k));
      states[knownId(k)] = "paused";
    }
    useWireless.setState({ states });
  },

  openLocalNetworkSettings: () => {
    const platform = useApp.getState().paths?.platform;
    void openUrl(platform === "windows" ? "ms-settings:network" : "x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork");
  },
}));

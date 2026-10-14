import { create } from "zustand";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { joinPath, native, streamTool } from "../lib/native";
import { displayName, type Device } from "../lib/parse";
import { fileStamp } from "../lib/format";
import { load, save } from "../lib/storage";
import { log } from "./log";
import { useApp } from "./app";
import { toolReady } from "./toolchain";

export type MirrorSource = "screen" | "frontCamera" | "backCamera";

export interface MirrorOptions {
  source: MirrorSource;
  maxSize: number;
  audio: boolean;
  turnScreenOff: boolean;
  stayAwake: boolean;
  showTouches: boolean;
  alwaysOnTop: boolean;
  viewOnly: boolean;
  record: boolean;
}

export const MIRROR_SIZES: [number, string][] = [[0, "Plné"], [1920, "1920 px"], [1280, "1280 px"], [1024, "1024 px"], [800, "800 px"]];
export const MIRROR_SOURCES: [MirrorSource, string][] = [["screen", "Obrazovka"], ["frontCamera", "Přední kamera"], ["backCamera", "Zadní kamera"]];

const defaults: MirrorOptions = {
  source: "screen",
  maxSize: 0,
  audio: true,
  turnScreenOff: false,
  stayAwake: true,
  showTouches: false,
  alwaysOnTop: false,
  viewOnly: false,
  record: false,
};

interface MirrorState {
  options: MirrorOptions;
  running: Record<string, number>;
  setOption: <K extends keyof MirrorOptions>(key: K, value: MirrorOptions[K]) => void;
  start: (device: Device) => Promise<void>;
  stop: (device: Device) => void;
  toggle: (device: Device) => void;
}

const streams = new Map<string, string>();

export const useMirror = create<MirrorState>((set, get) => ({
  options: { ...defaults, ...load<Partial<MirrorOptions>>("mirrorOptions", {}) },
  running: {},

  setOption: (key, value) => {
    const options = { ...get().options, [key]: value };
    set({ options });
    save("mirrorOptions", options);
  },

  start: async (device) => {
    if (!toolReady("scrcpy")) {
      log("error", "Zrcadlení potřebuje scrcpy. Doinstaluj ho v Systémových požadavcích.");
      return;
    }
    if (streams.has(device.serial)) return;
    const o = get().options;
    const args = ["-s", device.serial, "--window-title", `${displayName(device)} · Simple ADB tools`];
    if (o.maxSize > 0) args.push("--max-size", String(o.maxSize));
    if (!o.audio) args.push("--no-audio");
    if (o.source === "screen") {
      if (o.viewOnly) args.push("--no-control");
      else {
        if (o.turnScreenOff) args.push("--turn-screen-off");
        if (o.stayAwake) args.push("--stay-awake");
      }
      if (o.showTouches) args.push("--show-touches");
    } else {
      args.push("--video-source=camera", `--camera-facing=${o.source === "frontCamera" ? "front" : "back"}`, "--no-control");
    }
    if (o.alwaysOnTop) args.push("--always-on-top");
    let recording: string | null = null;
    const desktop = useApp.getState().paths?.desktop;
    if (o.record && desktop) {
      // Windows has no SIGINT for a clean stop; MKV stays playable even when scrcpy is killed.
      const ext = useApp.getState().paths?.platform === "windows" ? "mkv" : "mp4";
      recording = joinPath(desktop, `${displayName(device).replaceAll(" ", "-")}_mirror_${fileStamp()}.${ext}`);
      args.push("--record", recording);
    }

    log("command", `scrcpy ${args.join(" ")}`);
    try {
      const id = await streamTool("scrcpy", args, {
        onLines: (lines) => lines.forEach((l) => log("output", `scrcpy: ${l}`)),
        onExit: async (status) => {
          streams.delete(device.serial);
          const running = { ...get().running };
          delete running[device.serial];
          set({ running });
          log(status === 0 || status === 2 || status === 130 ? "info" : "error",
            status === 0 || status === 2 || status === 130 ? `Zrcadlení ${displayName(device)} ukončeno` : `scrcpy skončil s chybou (exit ${status}). Detail je ve výpisu výše.`);
          if (recording && (await native.pathExists(recording))) {
            log("success", `✓ Záznam uložen na plochu: ${recording.split(/[\\/]/).pop()}`);
            void revealItemInDir(recording);
          }
        },
      });
      streams.set(device.serial, id);
      set({ running: { ...get().running, [device.serial]: Date.now() } });
    } catch (e) {
      log("error", `scrcpy nejde spustit: ${String(e)}`);
    }
  },

  // SIGINT lets scrcpy finalize a running recording.
  stop: (device) => {
    const id = streams.get(device.serial);
    if (id) void native.stopStream(id, true);
  },

  toggle: (device) => (streams.has(device.serial) ? get().stop(device) : void get().start(device)),
}));

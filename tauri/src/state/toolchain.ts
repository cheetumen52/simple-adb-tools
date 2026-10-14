import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { native, type ToolName, type ToolStatus } from "../lib/native";
import { load, save } from "../lib/storage";

interface ToolchainState {
  adb: ToolStatus;
  aapt2: ToolStatus;
  scrcpy: ToolStatus;
  checkedOnce: boolean;
  installing: ToolName | null;
  progress: number;
  error: string | null;
  check: () => Promise<void>;
  install: (tool: ToolName) => Promise<void>;
  chooseAdb: () => Promise<void>;
}

let progressListener: Promise<unknown> | null = null;
const listenProgress = () =>
  (progressListener ??= listen<{ tool: string; progress: number }>("install-progress", (e) => {
    if (useToolchain.getState().installing === e.payload.tool) useToolchain.setState({ progress: e.payload.progress });
  }));

export const isFound = (s: ToolStatus): s is Extract<ToolStatus, { kind: "found" }> => s.kind === "found";

export const useToolchain = create<ToolchainState>((set, get) => ({
  adb: { kind: "checking" },
  aapt2: { kind: "checking" },
  scrcpy: { kind: "checking" },
  checkedOnce: false,
  installing: null,
  progress: 0,
  error: null,
  check: async () => {
    set({ adb: { kind: "checking" }, aapt2: { kind: "checking" }, scrcpy: { kind: "checking" } });
    const result = await native.toolchainCheck(load<string>("customAdbPath", ""));
    set({ adb: result.adb, aapt2: result.aapt2, scrcpy: result.scrcpy, checkedOnce: true });
  },
  install: async (tool) => {
    if (get().installing) return;
    set({ installing: tool, progress: 0, error: null });
    await listenProgress();
    try {
      await native.toolchainInstall(tool);
      set({ installing: null });
      await get().check();
    } catch (e) {
      set({ installing: null, error: `${tool}: ${String(e)}` });
    }
  },
  chooseAdb: async () => {
    const path = await open({ title: "Vyber binárku adb", multiple: false, directory: false });
    if (typeof path !== "string") return;
    save("customAdbPath", path);
    await get().check();
  },
}));


export const toolReady = (tool: ToolName) => isFound(useToolchain.getState()[tool]);
export const allReady = (s: Pick<ToolchainState, "adb" | "aapt2">) => isFound(s.adb) && isFound(s.aapt2);

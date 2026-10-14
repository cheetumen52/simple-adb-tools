import { create } from "zustand";
import { getVersion } from "@tauri-apps/api/app";
import { native, type SystemPaths } from "../lib/native";
import pkg from "../../package.json";

export type Tab = "requirements" | "install" | "toolset" | "settings";

/** Labels live in the translations under `tabs.<id>`. */
export const TABS: { id: Tab; number: string }[] = [
  { id: "requirements", number: "01" },
  { id: "install", number: "02" },
  { id: "toolset", number: "03" },
  { id: "settings", number: "04" },
];

export const tabNumber = (tab: Tab) => TABS.find((t) => t.id === tab)!.number;

export const BRAND = {
  company: "Hejzlar Development",
  appName: "Simple ADB tools",
  web: "https://hejzlar-development.cz",
  support: "https://paypal.me/cheetumen52",
  repo: "cheetumen52/simple-adb-tools",
};

interface AppState {
  tab: Tab;
  paths: SystemPaths | null;
  version: string;
  setTab: (tab: Tab) => void;
  init: () => Promise<void>;
}

export const useApp = create<AppState>((set) => ({
  tab: "install",
  paths: null,
  version: pkg.version,
  setTab: (tab) => set({ tab }),
  init: async () => {
    const [paths, version] = await Promise.all([native.systemPaths(), getVersion().catch(() => pkg.version)]);
    set({ paths, version });
  },
}));

export const isMac = () => useApp.getState().paths?.platform === "macos";

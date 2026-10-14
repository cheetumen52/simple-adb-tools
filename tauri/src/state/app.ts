import { create } from "zustand";
import { getVersion } from "@tauri-apps/api/app";
import { native, type SystemPaths } from "../lib/native";

export type Tab = "requirements" | "install" | "toolset" | "support";

export const TABS: { id: Tab; number: string; title: string; short: string }[] = [
  { id: "requirements", number: "01", title: "Systémové požadavky", short: "Požadavky" },
  { id: "install", number: "02", title: "Instalace aplikací", short: "Instalace" },
  { id: "toolset", number: "03", title: "ADB toolset", short: "ADB toolset" },
  { id: "support", number: "04", title: "Support", short: "Support" },
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
  version: "1.1.0",
  setTab: (tab) => set({ tab }),
  init: async () => {
    const [paths, version] = await Promise.all([native.systemPaths(), getVersion().catch(() => "1.1.0")]);
    set({ paths, version });
  },
}));

export const isMac = () => useApp.getState().paths?.platform === "macos";

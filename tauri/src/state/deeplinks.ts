import { create } from "zustand";
import { native } from "../lib/native";
import { parseAppLinks, startCommand, type DeepLink, type IntentExtra } from "../lib/deeplinks";
import { displayName, packageList, shQuote } from "../lib/parse";
import { load, save } from "../lib/storage";
import { tr } from "../i18n";
import { log } from "./log";
import { currentDevice, targetDevices, useToolset } from "./toolset";

export interface Draft {
  url: string;
  pkg: string | null;
  extras: IntentExtra[];
  name: string;
  /** Id of the saved link being edited, null for a new one. */
  editing: string | null;
}

interface DeepLinksState {
  saved: DeepLink[];
  history: string[];
  draft: Draft;
  packages: string[];
  appLinks: string[];
  appLinksFor: string | null;

  setDraft: (partial: Partial<Draft>) => void;
  addExtra: () => void;
  updateExtra: (index: number, partial: Partial<IntentExtra>) => void;
  removeExtra: (index: number) => void;
  open: (link?: Pick<DeepLink, "url" | "pkg" | "extras">) => Promise<void>;
  saveDraft: () => void;
  edit: (id: string) => void;
  remove: (id: string) => void;
  loadPackages: () => Promise<void>;
  loadAppLinks: (pkg: string) => Promise<void>;
}

const EMPTY: Draft = { url: "", pkg: null, extras: [], name: "", editing: null };
const get = (): DeepLinksState => useDeepLinks.getState();
const device = () => currentDevice(useToolset.getState().serial);

function persist(saved: DeepLink[]) {
  useDeepLinks.setState({ saved });
  save("deepLinks", saved);
}

export const useDeepLinks = create<DeepLinksState>((set) => ({
  saved: load<DeepLink[]>("deepLinks", []),
  history: load<string[]>("deepLinkHistory", []),
  draft: EMPTY,
  packages: [],
  appLinks: [],
  appLinksFor: null,

  setDraft: (partial) => {
    set({ draft: { ...get().draft, ...partial } });
    if (partial.pkg && partial.pkg !== get().appLinksFor) void get().loadAppLinks(partial.pkg);
  },
  addExtra: () => set({ draft: { ...get().draft, extras: [...get().draft.extras, { key: "", type: "string", value: "" }] } }),
  updateExtra: (index, partial) =>
    set({ draft: { ...get().draft, extras: get().draft.extras.map((e, i) => (i === index ? { ...e, ...partial } : e)) } }),
  removeExtra: (index) => set({ draft: { ...get().draft, extras: get().draft.extras.filter((_, i) => i !== index) } }),

  open: async (link) => {
    const target = link ?? get().draft;
    const url = target.url.trim();
    if (!url) return;
    const command = startCommand(target);
    await Promise.all(
      targetDevices().map(async (d) => {
        log("command", `${tr().toolset.logs.opening(url)} → ${displayName(d)}`);
        const r = await native.run("adb", ["-s", d.serial, "shell", command], 30000);
        const out = r.output.trim();
        // `am start -W` prints "Status: ok" or an error such as "Activity not started, unable to resolve Intent".
        const failed = r.status !== 0 || /Error|unable to resolve/i.test(out);
        if (failed) log("error", out);
      }),
    );
    const history = [url, ...get().history.filter((h) => h !== url)].slice(0, 8);
    set({ history });
    save("deepLinkHistory", history);
  },

  saveDraft: () => {
    const d = get().draft;
    if (!d.url.trim()) return;
    const link: DeepLink = { id: d.editing ?? crypto.randomUUID(), name: d.name.trim() || d.url.trim(), url: d.url.trim(), pkg: d.pkg, extras: d.extras.filter((e) => e.key.trim()) };
    persist(d.editing ? get().saved.map((s) => (s.id === d.editing ? link : s)) : [link, ...get().saved]);
    set({ draft: { ...d, editing: link.id, name: link.name } });
  },

  edit: (id) => {
    const link = get().saved.find((s) => s.id === id);
    if (!link) return;
    set({ draft: { url: link.url, pkg: link.pkg, extras: link.extras.map((e) => ({ ...e })), name: link.name, editing: link.id } });
    if (link.pkg) void get().loadAppLinks(link.pkg);
  },

  remove: (id) => {
    persist(get().saved.filter((s) => s.id !== id));
    if (get().draft.editing === id) set({ draft: { ...get().draft, editing: null } });
  },

  loadPackages: async () => {
    const d = device();
    if (!d) return;
    const r = await native.run("adb", ["-s", d.serial, "shell", "pm list packages -3"], 20000);
    set({ packages: packageList(r.output).sort() });
  },

  loadAppLinks: async (pkg) => {
    const d = device();
    if (!d) return;
    set({ appLinksFor: pkg, appLinks: [] });
    const r = await native.run("adb", ["-s", d.serial, "shell", `dumpsys package ${shQuote(pkg)}`], 30000);
    if (get().appLinksFor === pkg) set({ appLinks: parseAppLinks(r.output) });
  },
}));

export const newDraft = () => useDeepLinks.setState({ draft: EMPTY });

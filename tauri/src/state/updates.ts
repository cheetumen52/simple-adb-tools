import { create } from "zustand";
import { BRAND, useApp } from "./app";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; tag: string; url: string }
  | { kind: "failed"; reason: string };

/** "v1.2.3" → [1, 2, 3]; pre-release tags like "v1.2.0-beta" are ignored. */
export function versionParts(tag: string): number[] | null {
  const parts = tag.replace(/^v/i, "").split(".");
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.map(Number);
}

export function isOlder(a: string, b: string): boolean {
  const x = versionParts(a) ?? [0];
  const y = versionParts(b) ?? [0];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const l = x[i] ?? 0;
    const r = y[i] ?? 0;
    if (l !== r) return l < r;
  }
  return false;
}

interface UpdatesStore {
  state: UpdateState;
  lastChecked: Date | null;
  check: () => Promise<void>;
  start: () => void;
}

let timer: number | null = null;

export const useUpdates = create<UpdatesStore>((set, get) => ({
  state: { kind: "idle" },
  lastChecked: null,
  start: () => {
    void get().check();
    timer ??= window.setInterval(() => void get().check(), 6 * 3600 * 1000);
  },
  check: async () => {
    if (get().state.kind === "checking") return;
    set({ state: { kind: "checking" } });
    try {
      const res = await fetch(`https://api.github.com/repos/${BRAND.repo}/tags?per_page=100`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (res.status === 404) return set({ state: { kind: "failed", reason: "Repozitář zatím není veřejný. Kontrola začne fungovat po jeho zveřejnění." } });
      if (res.status === 403 || res.status === 429) return set({ state: { kind: "failed", reason: "GitHub dočasně omezil počet dotazů, zkusím to později." } });
      if (!res.ok) return set({ state: { kind: "failed", reason: `GitHub vrátil HTTP ${res.status}.` } });
      const tags = ((await res.json()) as { name: string }[]).map((t) => t.name).filter((t) => versionParts(t));
      set({ lastChecked: new Date() });
      const newest = tags.reduce<string | null>((best, t) => (!best || isOlder(best, t) ? t : best), null);
      const current = useApp.getState().version;
      if (newest && isOlder(current, newest)) {
        set({ state: { kind: "available", tag: newest, url: `https://github.com/${BRAND.repo}/releases/tag/${newest}` } });
      } else {
        set({ state: { kind: "upToDate" } });
      }
    } catch (e) {
      set({ state: { kind: "failed", reason: `Nepodařilo se spojit s GitHubem: ${String(e)}` } });
    }
  },
}));

import { create } from "zustand";
import { check as checkSignedUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { BRAND, useApp } from "./app";
import { log } from "./log";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  /** `autoInstall` = a signed update is ready to download; otherwise only a link to the release. */
  | { kind: "available"; tag: string; url: string; autoInstall: boolean }
  | { kind: "installing"; tag: string; progress: number | null }
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
  install: () => Promise<void>;
  start: () => void;
}

let timer: number | null = null;
let pending: Update | null = null;

const releaseUrl = (tag: string) => `https://github.com/${BRAND.repo}/releases/tag/${tag}`;

/** Fallback for releases published without updater artifacts: offer the release page instead. */
async function checkReleases(): Promise<UpdateState> {
  const res = await fetch(`https://api.github.com/repos/${BRAND.repo}/releases?per_page=30`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return { kind: "failed", reason: "Repozitář není veřejný, aktualizace nejde ověřit." };
  if (res.status === 403 || res.status === 429) return { kind: "failed", reason: "GitHub dočasně omezil počet dotazů, zkusím to později." };
  if (!res.ok) return { kind: "failed", reason: `GitHub vrátil HTTP ${res.status}.` };
  // Published releases only: a bare tag (or a draft) has no downloadable installers yet.
  const releases = ((await res.json()) as { tag_name: string; html_url: string; draft: boolean }[]).filter(
    (r) => !r.draft && versionParts(r.tag_name),
  );
  const newest = releases.reduce<(typeof releases)[number] | null>((best, r) => (!best || isOlder(best.tag_name, r.tag_name) ? r : best), null);
  if (newest && isOlder(useApp.getState().version, newest.tag_name)) {
    return { kind: "available", tag: newest.tag_name, url: newest.html_url, autoInstall: false };
  }
  return { kind: "upToDate" };
}

export const useUpdates = create<UpdatesStore>((set, get) => ({
  state: { kind: "idle" },
  lastChecked: null,

  start: () => {
    void get().check();
    timer ??= window.setInterval(() => void get().check(), 6 * 3600 * 1000);
  },

  check: async () => {
    const kind = get().state.kind;
    if (kind === "checking" || kind === "installing") return;
    set({ state: { kind: "checking" } });
    try {
      pending = await checkSignedUpdate();
      if (pending) {
        const tag = `v${pending.version}`;
        set({ state: { kind: "available", tag, url: releaseUrl(tag), autoInstall: true }, lastChecked: new Date() });
        return;
      }
    } catch {
      // No latest.json yet (older releases) or offline: fall back to the GitHub releases list.
    }
    try {
      set({ state: await checkReleases(), lastChecked: new Date() });
    } catch (e) {
      set({ state: { kind: "failed", reason: `Nepodařilo se spojit s GitHubem: ${String(e)}` } });
    }
  },

  install: async () => {
    const state = get().state;
    if (state.kind !== "available" || !state.autoInstall || !pending) return;
    const tag = state.tag;
    let total = 0;
    let downloaded = 0;
    set({ state: { kind: "installing", tag, progress: null } });
    log("info", `Stahuji aktualizaci ${tag}…`);
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total) set({ state: { kind: "installing", tag, progress: downloaded / total } });
        }
      });
      // Windows exits for the installer and restarts by itself; macOS swaps the bundle and needs a relaunch.
      log("success", `✓ Aktualizace ${tag} nainstalována, restartuji…`);
      await relaunch();
    } catch (e) {
      log("error", `Aktualizace selhala: ${String(e)}`);
      set({ state: { kind: "available", tag, url: releaseUrl(tag), autoInstall: false } });
    }
  },
}));

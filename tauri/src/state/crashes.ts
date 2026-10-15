import { create } from "zustand";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { native, streamTool } from "../lib/native";
import { CrashCollector, type CrashEvent } from "../lib/crash";
import { displayName, isReady, packageList } from "../lib/parse";
import { load, save } from "../lib/storage";
import { tr } from "../i18n";
import { useInstaller } from "./installer";
import { toolReady } from "./toolchain";

export interface CrashRecord extends CrashEvent {
  id: number;
  serial: string;
  device: string;
  at: number;
}

type Option = "enabled" | "notify" | "includeSystem";

interface CrashesState {
  enabled: boolean;
  notify: boolean;
  includeSystem: boolean;
  events: CrashRecord[];
  unseen: number;
  watching: string[];
  setOption: (key: Option, value: boolean) => void;
  markSeen: () => void;
  remove: (id: number) => void;
  clear: () => void;
  sync: () => void;
}

const MAX_EVENTS = 50;
const QUIET_MS = 1500;
// A stream that keeps dying (adb restart, unplug) is retried, but not in a tight loop.
const RESTART_DELAY_MS = 3000;

interface Watcher {
  id: string | null;
  collector: CrashCollector;
  thirdParty: Set<string> | null;
  flushTimer: number | null;
}

const watchers = new Map<string, Watcher>();
const lastStart = new Map<string, number>();
let nextId = 1;
let syncTimer: number | null = null;

const get = () => useCrashes.getState();

async function thirdPartyPackages(serial: string) {
  const r = await native.run("adb", ["-s", serial, "shell", "pm list packages -3"], 15000);
  return new Set(packageList(r.output));
}

async function notify(record: CrashRecord) {
  if (!get().notify || document.hasFocus()) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title: tr().crashes.notifyTitle(record.pkg, record.kind), body: `${record.device}: ${record.title}` });
  } catch {
    // Notifications are best effort.
  }
}

async function accept(serial: string, event: CrashEvent) {
  const w = watchers.get(serial);
  if (!w) return;
  if (!get().includeSystem) {
    // An app installed after the watcher started is not in the cached list yet.
    if (!w.thirdParty?.has(event.pkg)) w.thirdParty = await thirdPartyPackages(serial);
    if (!w.thirdParty.has(event.pkg)) return;
  }
  const device = useInstaller.getState().devices.find((d) => d.serial === serial);
  const record: CrashRecord = { ...event, id: nextId++, serial, device: device ? displayName(device) : serial, at: Date.now() };
  useCrashes.setState((s) => ({ events: [record, ...s.events].slice(0, MAX_EVENTS), unseen: s.unseen + 1 }));
  void notify(record);
}

function deliver(serial: string, events: CrashEvent[]) {
  for (const e of events) void accept(serial, e);
}

async function startWatcher(serial: string) {
  const w: Watcher = { id: null, collector: new CrashCollector(), thirdParty: null, flushTimer: null };
  watchers.set(serial, w);
  lastStart.set(serial, Date.now());
  useCrashes.setState((s) => ({ watching: [...s.watching, serial] }));
  try {
    // Start from the device's own clock so old crashes in the buffer are not reported again.
    const now = (await native.run("adb", ["-s", serial, "shell", "date '+%m-%d %H:%M:%S.000'"], 10000)).output.trim();
    const since = /^\d\d-\d\d \d\d:\d\d:\d\d\.000$/.test(now) ? now : "1";
    const args = ["-s", serial, "logcat", "-v", "time", "-T", since, "-b", "crash", "-b", "system", "AndroidRuntime:E", "ActivityManager:E", "DEBUG:F", "libc:F", "*:S"];
    w.thirdParty = await thirdPartyPackages(serial);
    w.id = await streamTool("adb", args, {
      onLines: (lines) => {
        for (const line of lines) deliver(serial, w.collector.push(line));
        if (w.flushTimer) window.clearTimeout(w.flushTimer);
        w.flushTimer = window.setTimeout(() => deliver(serial, w.collector.flush()), QUIET_MS);
      },
      onExit: () => {
        if (watchers.get(serial) === w) dropWatcher(serial);
        scheduleSync(RESTART_DELAY_MS);
      },
    });
  } catch {
    dropWatcher(serial);
  }
}

function dropWatcher(serial: string) {
  const w = watchers.get(serial);
  if (w?.flushTimer) window.clearTimeout(w.flushTimer);
  watchers.delete(serial);
  useCrashes.setState((s) => ({ watching: s.watching.filter((x) => x !== serial) }));
}

function stopWatcher(serial: string) {
  const id = watchers.get(serial)?.id;
  dropWatcher(serial);
  if (id) void native.stopStream(id);
}

function scheduleSync(delay: number) {
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    get().sync();
  }, delay);
}

export const useCrashes = create<CrashesState>((set) => ({
  enabled: load("crashWatch", true),
  notify: load("crashNotify", true),
  includeSystem: load("crashIncludeSystem", false),
  events: [],
  unseen: 0,
  watching: [],

  setOption: (key, value) => {
    set({ [key]: value });
    save(key === "enabled" ? "crashWatch" : key === "notify" ? "crashNotify" : "crashIncludeSystem", value);
    if (key === "enabled") get().sync();
  },

  markSeen: () => set({ unseen: 0 }),
  remove: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
  clear: () => set({ events: [], unseen: 0 }),

  sync: () => {
    const wanted = get().enabled && toolReady("adb") ? useInstaller.getState().devices.filter(isReady).map((d) => d.serial) : [];
    for (const serial of [...watchers.keys()]) if (!wanted.includes(serial)) stopWatcher(serial);
    for (const serial of wanted) {
      if (watchers.has(serial)) continue;
      const wait = (lastStart.get(serial) ?? 0) + RESTART_DELAY_MS - Date.now();
      if (wait > 0) scheduleSync(wait);
      else void startWatcher(serial);
    }
  },
}));

useInstaller.subscribe((s, prev) => {
  if (s.devices !== prev.devices) get().sync();
});

/** Newest crash of a package, for badges next to the app. */
export const latestCrash = (events: CrashRecord[], pkg: string) => events.find((e) => e.pkg === pkg) ?? null;

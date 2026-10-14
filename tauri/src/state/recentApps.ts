import { create } from "zustand";
import { native } from "../lib/native";
import { displayName, packageList, sections, shQuote, type Device } from "../lib/parse";
import { log } from "./log";
import { readyDevices, targets, useInstaller } from "./installer";

export interface RecentApp {
  pkg: string;
  versionName: string;
  lastUpdate: number;
  firstInstall: number;
}

export type RecentAction = "launch" | "restart" | "stop" | "settings" | "clearData" | "uninstall";

interface RecentAppsState {
  serial: string | null;
  apps: RecentApp[];
  loading: boolean;
  loadedFor: string | null;
  setSerial: (serial: string) => void;
  load: () => Promise<void>;
  action: (pkg: string, action: RecentAction) => Promise<void>;
}

const LIMIT = 10;

/** Device the list shows: the user's pick, else the first selected install target, else any ready device. */
export function recentDevice(serial: string | null): Device | null {
  const s = useInstaller.getState();
  const ready = readyDevices(s);
  return ready.find((d) => d.serial === serial) ?? targets(s)[0] ?? ready[0] ?? null;
}

// dumpsys prints device-local "2026-10-14 12:39:05"; the phone and the computer normally share a timezone.
const parseTime = (s: string | undefined) => (s ? new Date(s.replace(" ", "T")).getTime() || 0 : 0);

function parseDump(dump: string, thirdParty: Set<string>): RecentApp[] {
  const apps = new Map<string, RecentApp>();
  let current: RecentApp | null = null;
  for (const raw of dump.split("\n")) {
    const line = raw.trim();
    const pkg = line.match(/^Package \[([^\]]+)\]/)?.[1];
    if (pkg) {
      current = apps.has(pkg) || !thirdParty.has(pkg) ? null : { pkg, versionName: "?", lastUpdate: 0, firstInstall: 0 };
      if (current) apps.set(pkg, current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("versionName=")) current.versionName = line.slice(12);
    else if (line.startsWith("firstInstallTime=")) current.firstInstall = parseTime(line.slice(17));
    else if (line.startsWith("lastUpdateTime=")) current.lastUpdate = parseTime(line.slice(15));
  }
  return [...apps.values()].sort((a, b) => b.lastUpdate - a.lastUpdate).slice(0, LIMIT);
}

export const useRecentApps = create<RecentAppsState>((set, get) => ({
  serial: null,
  apps: [],
  loading: false,
  loadedFor: null,

  setSerial: (serial) => {
    set({ serial, apps: [] });
    void get().load();
  },

  load: async () => {
    const device = recentDevice(get().serial);
    if (!device || get().loading) return;
    set({ loading: true });
    const script =
      "echo @@third; pm list packages -3; echo @@dump; dumpsys package packages | grep -E 'Package \\[|versionName=|lastUpdateTime=|firstInstallTime='";
    const r = await native.run("adb", ["-s", device.serial, "shell", script], 30000);
    const s = sections(r.output);
    set({ apps: parseDump(s.dump ?? "", new Set(packageList(s.third))), loading: false, loadedFor: device.serial });
  },

  action: async (pkg, action) => {
    const device = recentDevice(get().serial);
    if (!device) return;
    if (action === "uninstall") {
      log("command", `adb uninstall ${pkg} → ${displayName(device)}`);
      const r = await native.run("adb", ["-s", device.serial, "uninstall", pkg], 60000);
      log(r.output.includes("Success") ? "success" : "error", r.output.trim() || "Odinstalace selhala");
      await get().load();
      return;
    }
    const q = shQuote(pkg);
    const launch = `monkey -p ${q} -c android.intent.category.LAUNCHER 1`;
    const commands: Record<Exclude<RecentAction, "uninstall">, [string, string]> = {
      launch: ["Spouštím", launch],
      restart: ["Restartuji", `am force-stop ${q}; ${launch}`],
      stop: ["Zastavuji", `am force-stop ${q}`],
      settings: ["Otevírám nastavení", `am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d ${shQuote(`package:${pkg}`)}`],
      clearData: ["Mažu data", `pm clear ${q}`],
    };
    const [title, command] = commands[action];
    log("command", `${title} ${pkg} → ${displayName(device)}`);
    const r = await native.run("adb", ["-s", device.serial, "shell", command], 30000);
    const out = r.output.split("\n").filter((l) => l.trim() && !l.includes("Events injected") && !l.startsWith("  bash arg")).join("\n").trim();
    if (out) log(r.status === 0 ? "output" : "error", out);
  },
}));

// Refresh after every finished install/uninstall job, so a fresh install shows up at the top.
useInstaller.subscribe((s, prev) => {
  if (prev.running && !s.running) void useRecentApps.getState().load();
});

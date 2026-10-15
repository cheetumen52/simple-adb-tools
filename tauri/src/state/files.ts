import { create } from "zustand";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { baseName, joinPath, native } from "../lib/native";
import { joinRemote, parentRemote, parseLs, validName, type FileEntry } from "../lib/files";
import { displayName, packageList, shQuote, type Device } from "../lib/parse";
import { tr } from "../i18n";
import { log } from "./log";
import { useApp } from "./app";
import { currentDevice, useToolset } from "./toolset";

export const STORAGE_ROOT = "/sdcard";
export const SHORTCUTS = ["Download", "DCIM", "Pictures", "Documents", "Movies"];

interface FilesState {
  /** Device the listing belongs to; a different device resets the browser. */
  serial: string | null;
  path: string;
  /** Debuggable app whose private data is browsed through `run-as`, or null for shared storage. */
  app: string | null;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  busy: string | null;
  debuggable: string[] | null;

  open: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  setApp: (pkg: string | null) => Promise<void>;
  loadDebuggable: () => Promise<void>;
  pull: (entry: FileEntry) => Promise<void>;
  remove: (entry: FileEntry) => Promise<void>;
  rename: (entry: FileEntry, name: string) => Promise<void>;
  mkdir: (name: string) => Promise<void>;
  upload: (paths: string[]) => Promise<void>;
}

const get = (): FilesState => useFiles.getState();
const device = () => currentDevice(useToolset.getState().serial);
const appRoot = (pkg: string) => `/data/data/${pkg}`;
// Temporary hop for uploads into app data: run-as can read it, the shell user can write it.
const TMP = "/data/local/tmp";

/** Shell command in shared storage, or as the app's user inside its private data. */
function wrap(command: string): string {
  const app = get().app;
  return app ? `run-as ${shQuote(app)} sh -c ${shQuote(command)}` : command;
}

async function sh(d: Device, command: string, timeoutMs = 30000) {
  return native.run("adb", ["-s", d.serial, "shell", wrap(command)], timeoutMs);
}

async function logged(d: Device, title: string, command: string, timeoutMs?: number) {
  log("command", `${title} → ${displayName(d)}`);
  const r = await sh(d, command, timeoutMs);
  const out = r.output.trim();
  if (out) log(r.status === 0 ? "output" : "error", out);
  return r;
}

export const useFiles = create<FilesState>((set) => ({
  serial: null,
  path: STORAGE_ROOT,
  app: null,
  entries: [],
  loading: false,
  error: null,
  busy: null,
  debuggable: null,

  open: async (path) => {
    const d = device();
    if (!d) return;
    let target = path;
    if (get().serial !== d.serial) {
      set({ serial: d.serial, app: null, debuggable: null });
      target = STORAGE_ROOT;
    }
    set({ loading: true, error: null, path: target });
    // The trailing slash lists the contents of a symlinked folder (/sdcard) instead of the link itself.
    const r = await sh(d, `ls -la ${shQuote(`${target.replace(/\/+$/, "")}/`)}`);
    if (get().path !== target) return;
    const entries = parseLs(r.output);
    set({ loading: false, entries, error: r.status !== 0 && !entries.length ? r.output.trim() || tr().files.cantRead : null });
  },

  refresh: () => get().open(get().path),

  setApp: async (pkg) => {
    set({ app: pkg, entries: [] });
    await get().open(pkg ? appRoot(pkg) : STORAGE_ROOT);
  },

  loadDebuggable: async () => {
    const d = device();
    if (!d) return;
    // `run-as` succeeds only for debuggable apps, which is exactly the set whose data we can browse.
    const script = `for p in $(pm list packages -3 | cut -d: -f2); do run-as "$p" true 2>/dev/null && echo "package:$p"; done`;
    const r = await native.run("adb", ["-s", d.serial, "shell", script], 60000);
    set({ debuggable: packageList(r.output).sort() });
  },

  pull: async (entry) => {
    const d = device();
    const downloads = useApp.getState().paths?.downloads;
    if (!d || !downloads) return;
    const remote = joinRemote(get().path, entry.name);
    const local = joinPath(downloads, entry.name);
    set({ busy: entry.name });
    let ok: boolean;
    if (get().app) {
      // Private files can only be read through run-as, so stream them out instead of `adb pull`.
      log("command", `run-as ${get().app} cat ${remote} → ${displayName(d)}`);
      const r = await native.runToFile("adb", ["-s", d.serial, "exec-out", "run-as", get().app!, "cat", remote], local);
      ok = r.status === 0;
      if (!ok) log("error", r.output.trim());
    } else {
      log("command", `adb pull ${remote} → ${displayName(d)}`);
      const r = await native.run("adb", ["-s", d.serial, "pull", remote, local], 600000);
      ok = r.status === 0;
      if (!ok) log("error", r.output.trim());
    }
    set({ busy: null });
    if (ok) {
      log("success", tr().files.pulled(entry.name));
      void revealItemInDir(local);
    }
  },

  remove: async (entry) => {
    const d = device();
    if (!d) return;
    await logged(d, tr().files.logs.remove(entry.name), `rm -rf ${shQuote(joinRemote(get().path, entry.name))}`);
    await get().refresh();
  },

  rename: async (entry, name) => {
    const d = device();
    if (!d || !validName(name) || name === entry.name) return;
    await logged(d, tr().files.logs.rename(entry.name, name), `mv ${shQuote(joinRemote(get().path, entry.name))} ${shQuote(joinRemote(get().path, name))}`);
    await get().refresh();
  },

  mkdir: async (name) => {
    const d = device();
    if (!d || !validName(name)) return;
    await logged(d, tr().files.logs.mkdir(name), `mkdir -p ${shQuote(joinRemote(get().path, name))}`);
    await get().refresh();
  },

  upload: async (paths) => {
    const d = device();
    if (!d || !paths.length) return;
    const dir = get().path;
    const app = get().app;
    for (const local of paths) {
      const name = baseName(local);
      set({ busy: name });
      if (app) {
        const tmp = `${TMP}/${name}`;
        log("command", `adb push ${name} → ${app}:${dir}`);
        const r = await native.run("adb", ["-s", d.serial, "push", local, tmp], 600000);
        if (r.status === 0) {
          await native.run("adb", ["-s", d.serial, "shell", `run-as ${shQuote(app)} cp -r ${shQuote(tmp)} ${shQuote(joinRemote(dir, name))}; rm -rf ${shQuote(tmp)}`], 120000);
          log("success", tr().files.uploaded(name));
        } else log("error", r.output.trim());
      } else {
        log("command", `adb push ${name} ${dir}/ → ${displayName(d)}`);
        const r = await native.run("adb", ["-s", d.serial, "push", local, `${dir.replace(/\/+$/, "")}/`], 600000);
        if (r.status === 0) log("success", tr().files.uploaded(name));
        else log("error", r.output.trim());
      }
    }
    set({ busy: null });
    await get().refresh();
  },
}));

export const filesParent = () => {
  const { path, app } = get();
  const root = app ? appRoot(app) : "/";
  return path === root ? null : parentRemote(path);
};

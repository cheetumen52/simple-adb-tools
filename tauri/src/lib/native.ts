import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ToolName = "adb" | "aapt2" | "scrcpy";

export type ToolStatus =
  | { kind: "checking" }
  | { kind: "missing" }
  | { kind: "found"; path: string; version: string; managed: boolean }
  | { kind: "broken"; path: string; error: string };

export interface RunResult {
  status: number;
  output: string;
}

export interface ApkEntry {
  path: string;
  name: string;
  folder: string;
  modifiedMs: number;
  size: number;
}

export interface SystemPaths {
  home: string;
  desktop: string;
  downloads: string;
  platform: "macos" | "windows" | "linux";
}

export type ProbeResult = "reachable" | "refused" | "blocked" | "timeout";

export const native = {
  toolchainCheck: (customAdb?: string) =>
    invoke<Record<ToolName, ToolStatus>>("toolchain_check", { customAdb: customAdb ?? null }),
  toolchainInstall: (tool: ToolName) => invoke<void>("toolchain_install", { tool }),
  run: (tool: ToolName, args: string[], timeoutMs?: number) =>
    invoke<RunResult>("run_tool", { tool, args, timeoutMs: timeoutMs ?? null }),
  runToFile: (tool: ToolName, args: string[], path: string) =>
    invoke<RunResult>("run_tool_to_file", { tool, args, path }),
  probeTcp: (host: string, port: number, timeoutMs?: number) =>
    invoke<ProbeResult>("probe_tcp", { host, port, timeoutMs: timeoutMs ?? null }),
  listApks: (folders: string[], limit: number) => invoke<ApkEntry[]>("list_apks", { folders, limit }),
  systemPaths: () => invoke<SystemPaths>("system_paths"),
  writeText: (path: string, contents: string) => invoke<void>("write_text", { path, contents }),
  makeDir: (path: string) => invoke<void>("make_dir", { path }),
  pathExists: (path: string) => invoke<boolean>("path_exists", { path }),
  takePendingFiles: () => invoke<string[]>("take_pending_files"),
  stopStream: (id: string, interrupt = false) => invoke<void>("stop_stream", { id, interrupt }),
  /** Language of messages produced by the backend (errors from tool downloads and runs). */
  setLocale: (lang: string) => invoke<void>("set_locale", { lang }),
};

interface StreamHandlers {
  onLines?: (lines: string[]) => void;
  onExit?: (status: number) => void;
}

const handlers = new Map<string, StreamHandlers>();
let listening: Promise<void> | null = null;

function ensureListeners() {
  listening ??= (async () => {
    await listen<{ id: string; lines: string[] }>("proc-lines", (e) => handlers.get(e.payload.id)?.onLines?.(e.payload.lines));
    await listen<{ id: string; status: number }>("proc-exit", (e) => {
      const h = handlers.get(e.payload.id);
      handlers.delete(e.payload.id);
      h?.onExit?.(e.payload.status);
    });
  })();
  return listening;
}

let streamCounter = 0;

/** Starts a long-running tool process; returns its id for `native.stopStream`. */
export async function streamTool(tool: ToolName, args: string[], h: StreamHandlers): Promise<string> {
  await ensureListeners();
  const id = `${tool}-${Date.now()}-${++streamCounter}`;
  handlers.set(id, h);
  try {
    await invoke("stream_tool", { id, tool, args });
  } catch (e) {
    handlers.delete(id);
    throw e;
  }
  return id;
}

/** Collects all lines of a streamed run and resolves with its exit status. */
export function streamToEnd(tool: ToolName, args: string[], onLine: (line: string) => void): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    streamTool(tool, args, {
      onLines: (batch) => {
        lines.push(...batch);
        batch.forEach(onLine);
      },
      onExit: (status) => resolve({ status, output: lines.join("\n") }),
    }).catch(reject);
  });
}

export function joinPath(...parts: string[]): string {
  const sep = parts[0]?.includes("\\") ? "\\" : "/";
  return parts
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .filter(Boolean)
    .join(sep);
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function parentDir(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

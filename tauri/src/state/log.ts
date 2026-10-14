import { create } from "zustand";
import { timeOfDay } from "../lib/format";

export type LogKind = "info" | "command" | "output" | "success" | "error";

export interface LogLine {
  id: number;
  time: Date;
  kind: LogKind;
  text: string;
}

interface LogState {
  lines: LogLine[];
  append: (kind: LogKind, text: string) => void;
  clear: () => void;
  copy: () => Promise<void>;
}

// sessionStorage survives a webview reload but not an app restart, which is the lifetime the log should have.
const STORAGE_KEY = "log";

function restore(): LogLine[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as (Omit<LogLine, "time"> & { time: string })[]).map((l) => ({ ...l, time: new Date(l.time) }));
  } catch {
    return [];
  }
}

let saveTimer: number | null = null;
function persist(lines: LogLine[]) {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines.slice(-500)));
    } catch {
      // Quota or blocked storage: the log just won't survive a reload.
    }
  }, 300);
}

const initial = restore();
let nextId = (initial.at(-1)?.id ?? 0) + 1;

export const useLog = create<LogState>((set, get) => ({
  lines: initial,
  append: (kind, text) =>
    set((s) => {
      const all = [...s.lines, { id: nextId++, time: new Date(), kind, text }];
      const lines = all.length > 2000 ? all.slice(-1500) : all;
      persist(lines);
      return { lines };
    }),
  clear: () => {
    persist([]);
    set({ lines: [] });
  },
  copy: async () => {
    const text = get()
      .lines.map((l) => `${timeOfDay(l.time)}  ${l.text}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
  },
}));

export const log = (kind: LogKind, text: string) => useLog.getState().append(kind, text);

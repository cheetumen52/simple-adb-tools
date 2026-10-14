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

let nextId = 1;

export const useLog = create<LogState>((set, get) => ({
  lines: [],
  append: (kind, text) =>
    set((s) => {
      const lines = [...s.lines, { id: nextId++, time: new Date(), kind, text }];
      return { lines: lines.length > 2000 ? lines.slice(-1500) : lines };
    }),
  clear: () => set({ lines: [] }),
  copy: async () => {
    const text = get()
      .lines.map((l) => `${timeOfDay(l.time)}  ${l.text}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
  },
}));

export const log = (kind: LogKind, text: string) => useLog.getState().append(kind, text);

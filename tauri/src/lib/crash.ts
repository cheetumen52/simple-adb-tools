/** Crash detection on `logcat -v time -b crash -b system AndroidRuntime:E ActivityManager:E DEBUG:F libc:F *:S`. */

export type CrashKind = "crash" | "native" | "anr";

export interface CrashEvent {
  kind: CrashKind;
  pkg: string;
  pid: number | null;
  /** Device-local logcat timestamp, e.g. "10-15 19:41:02.343". */
  time: string;
  /** Exception line, signal or ANR reason. */
  title: string;
  lines: string[];
}

interface LogLine {
  time: string;
  tag: string;
  pid: number;
  msg: string;
}

const LINE = /^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+[VDIWEF]\/(.+?)\(\s*(\d+)\): ?(.*)$/;
const MAX_LINES = 200;

export function parseLogLine(line: string): LogLine | null {
  const m = line.match(LINE);
  return m ? { time: m[1], tag: m[2].trim(), pid: Number(m[3]), msg: m[4] } : null;
}

interface Block extends CrashEvent {
  tag: string;
  source: number;
  closed: boolean;
}

/**
 * Groups logcat lines into crash events. A block is a run of lines with the same tag and logger pid;
 * `flush()` emits what is still open (call it after a short quiet period).
 */
export class CrashCollector {
  private block: Block | null = null;
  /** `libc: Fatal signal` lines waiting for their debuggerd block, keyed by crashed pid. */
  private signals = new Map<number, { time: string; title: string; comm: string }>();

  push(raw: string): CrashEvent[] {
    const line = parseLogLine(raw);
    if (!line) return [];
    const b = this.block;
    if (b && b.tag === line.tag && b.source === line.pid) {
      this.append(b, line.msg);
      return [];
    }
    const done = this.finish();
    this.start(line);
    return done;
  }

  flush(): CrashEvent[] {
    const done = this.finish();
    for (const [pid, s] of this.signals) {
      done.push({ kind: "native", pkg: s.comm, pid, time: s.time, title: s.title, lines: [s.title] });
    }
    this.signals.clear();
    return done;
  }

  private start(line: LogLine) {
    const base = { time: line.time, tag: line.tag, source: line.pid, pid: null, pkg: "", title: "", lines: [line.msg], closed: false };
    if (line.tag === "AndroidRuntime" && line.msg.startsWith("FATAL EXCEPTION")) this.block = { ...base, kind: "crash" };
    else if (line.tag === "DEBUG" && line.msg.startsWith("*** ***")) this.block = { ...base, kind: "native" };
    else if (line.tag === "ActivityManager" && line.msg.startsWith("ANR in ")) {
      this.block = { ...base, kind: "anr", pkg: line.msg.slice(7).split(" ")[0] };
    } else if (line.tag === "libc" && line.msg.startsWith("Fatal signal")) {
      // "... pid 7553 (.cuppka.app.dev)": the name is the kernel's 15-char comm, so prefer debuggerd's >>> pkg <<<.
      const m = line.msg.match(/pid (\d+) \(([^)]*)\)\s*$/);
      if (m) this.signals.set(Number(m[1]), { time: line.time, title: line.msg.replace(/^Fatal signal /, "signal "), comm: m[2] });
    }
  }

  private append(b: Block, msg: string) {
    if (b.closed || b.lines.length >= MAX_LINES) return;
    if (b.kind === "anr" && (msg.startsWith("-----") || msg.startsWith("Load:"))) {
      b.closed = true;
      return;
    }
    b.lines.push(msg);
    if (b.kind === "crash") {
      const proc = msg.match(/^Process: ([^,]+), PID: (\d+)/);
      if (proc) {
        b.pkg = proc[1];
        b.pid = Number(proc[2]);
      } else if (b.pkg && !b.title) b.title = msg.trim();
    } else if (b.kind === "native") {
      const who = msg.match(/^pid: (\d+),.*>>> (.+?) <<</);
      if (who) {
        b.pid = Number(who[1]);
        b.pkg = who[2];
      } else if (!b.title && msg.startsWith("signal ")) b.title = msg;
    } else {
      if (msg.startsWith("PID: ")) b.pid = Number(msg.slice(5)) || null;
      else if (msg.startsWith("Reason: ")) b.title = msg.slice(8);
    }
  }

  private finish(): CrashEvent[] {
    const b = this.block;
    this.block = null;
    if (!b || !b.pkg) return [];
    if (b.kind === "native" && b.pid != null) {
      const s = this.signals.get(b.pid);
      this.signals.delete(b.pid);
      if (!b.title && s) b.title = s.title;
    }
    return [{ kind: b.kind, pkg: b.pkg, pid: b.pid, time: b.time, title: b.title || b.lines[0], lines: b.lines }];
  }
}

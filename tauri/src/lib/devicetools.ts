/** Parsers for the test toggles: permissions, display, proxy, locales and battery. */

export interface RuntimePermission {
  name: string;
  granted: boolean;
}

/** First `runtime permissions:` block of `dumpsys package <pkg>` (user 0). */
export function parseRuntimePermissions(dump: string): RuntimePermission[] {
  const lines = dump.split("\n");
  const start = lines.findIndex((l) => l.trim() === "runtime permissions:");
  if (start < 0) return [];
  const result: RuntimePermission[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^\s*([\w.]+): granted=(true|false)/);
    if (!m) break;
    result.push({ name: m[1], granted: m[2] === "true" });
  }
  return result;
}

/** "android.permission.ACCESS_FINE_LOCATION" → "ACCESS_FINE_LOCATION". */
export const permissionLabel = (name: string) => name.replace(/^android\.permission\./, "");

export interface Density {
  physical: number | null;
  override: number | null;
}

export function parseDensity(out: string): Density {
  const num = (label: string) => {
    const m = out.match(new RegExp(`${label} density: (\\d+)`));
    return m ? Number(m[1]) : null;
  };
  return { physical: num("Physical"), override: num("Override") };
}

/** `settings get global http_proxy`: "null", "" and ":0" all mean no proxy. */
export function parseProxy(out: string): string | null {
  const v = out.trim();
  return !v || v === "null" || v === ":0" ? null : v;
}

/** Port of a proxy that points at the device itself, i.e. one set up through `adb reverse`. */
export function reversePort(proxy: string | null): number | null {
  const m = proxy?.match(/^(?:127\.0\.0\.1|localhost):(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** "Locales for com.x for user 0 are [en-US,cs]" → ["en-US", "cs"]. */
export function parseAppLocales(out: string): string[] | null {
  const m = out.match(/are \[([^\]]*)\]/);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

export interface BatteryState {
  level: number | null;
  status: string | null;
  plugged: boolean;
}

export function parseBattery(dump: string): BatteryState {
  const field = (name: string) => dump.match(new RegExp(`^\\s*${name}: (.+)$`, "m"))?.[1]?.trim() ?? null;
  const level = field("level");
  const plugged = ["AC powered", "USB powered", "Wireless powered"].some((k) => field(k) === "true");
  return { level: level != null ? Number(level) : null, status: field("status"), plugged };
}

/** `settings get` values for on/off settings: "1" on, anything else off, "null" unknown. */
export function parseFlag(out: string | undefined): boolean | null {
  const v = (out ?? "").trim();
  if (v === "1" || v === "enabled") return true;
  if (v === "0" || v === "disabled") return false;
  return null;
}

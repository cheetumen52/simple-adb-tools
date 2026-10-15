import { tr } from "../i18n";

export interface Device {
  serial: string;
  state: string;
  model: string | null;
}

export const isReady = (d: Device) => d.state === "device";
export const isEmulator = (d: Device) => d.serial.startsWith("emulator-");
export const isWireless = (d: Device) => !isEmulator(d) && (d.serial.includes(":") || d.serial.includes("._adb-tls-"));
export const displayName = (d: Device) => d.model ?? (isReady(d) ? d.serial : tr().common.unknownDevice);

/**
 * One entry per physical phone. A phone on USB and Wi‑Fi at once is listed twice by `adb devices`;
 * the USB connection wins. Devices whose hardware serial isn't known yet are kept.
 */
export function distinctDevices(devices: Device[], hardwareSerial: (serial: string) => string | null | undefined): Device[] {
  const keep = new Set<Device>();
  const seen = new Set<string>();
  for (const d of [...devices].sort((a, b) => Number(isWireless(a)) - Number(isWireless(b)))) {
    const hw = hardwareSerial(d.serial);
    if (hw && seen.has(hw)) continue;
    if (hw) seen.add(hw);
    keep.add(d);
  }
  return devices.filter((d) => keep.has(d));
}

export function parseDevices(out: string): Device[] {
  return out
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((p) => p.length >= 2 && p[0] && !p[0].startsWith("*"))
    .map((p) => {
      const model = p.find((x) => x.startsWith("model:"));
      return { serial: p[0], state: p[1], model: model ? model.slice(6).replaceAll("_", " ") : null };
    });
}

export interface ApkInfo {
  label: string | null;
  pkg: string;
  versionName: string;
  versionCode: number | null;
}

export const apkVersion = (i: ApkInfo) => (i.versionCode != null ? `${i.versionName} (${i.versionCode})` : i.versionName);

export function parseBadging(out: string): ApkInfo | null {
  const attr = (prefix: string) => {
    const idx = out.indexOf(prefix);
    if (idx < 0) return null;
    const rest = out.slice(idx + prefix.length);
    return rest.slice(0, rest.indexOf("'"));
  };
  const pkg = attr("package: name='");
  if (!pkg) return null;
  const code = attr("versionCode='");
  return { label: attr("application-label:'"), pkg, versionName: attr("versionName='") ?? "?", versionCode: code ? Number(code) : null };
}

export interface InstalledVersion {
  versionName: string;
  versionCode: number | null;
}

export function parseDumpsysVersion(out: string, pkg: string): InstalledVersion | null {
  if (!out.includes(`Package [${pkg}]`)) return null;
  const value = (key: string) => out.match(new RegExp(`${key}=(\\S+)`))?.[1] ?? null;
  const code = value("versionCode");
  return { versionName: value("versionName") ?? "?", versionCode: code ? Number(code) : null };
}

export type VersionComparison = "notInstalled" | "upgrade" | "same" | "downgrade" | "unknown";

export function compareVersions(apk: ApkInfo, installed: InstalledVersion | null): VersionComparison {
  if (!installed) return "notInstalled";
  if (apk.versionCode == null || installed.versionCode == null) return "unknown";
  if (apk.versionCode > installed.versionCode) return "upgrade";
  if (apk.versionCode < installed.versionCode) return "downgrade";
  return "same";
}

/** Splits `echo @@key; cmd` style shell output into a map. */
export function sections(out: string): Record<string, string> {
  const result: Record<string, string> = {};
  let key: string | null = null;
  let lines: string[] = [];
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("@@")) {
      if (key) result[key] = lines.join("\n");
      key = line.slice(2);
      lines = [];
    } else if (line) {
      lines.push(line);
    }
  }
  if (key) result[key] = lines.join("\n");
  return result;
}

export function packageList(out: string | undefined): string[] {
  return (out ?? "")
    .split("\n")
    .filter((l) => l.startsWith("package:"))
    .map((l) => l.slice(8).trim());
}

/** Single-quotes a value for the device's /system/bin/sh. */
export const shQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

export type FailureReason =
  | "updateIncompatible"
  | "versionDowngrade"
  | "parseFailed"
  | "insufficientStorage"
  | "userRestricted"
  | "noMatchingAbis"
  | "olderSdk"
  | "testOnly"
  | "deviceOffline"
  | "deviceNotFound"
  | "unknown";

/** `reason` keys `failures` in the translations, so the banner follows a language switch. */
export interface FailureHint {
  reason: FailureReason;
  suggestReinstall: boolean;
  retryable: boolean;
  file?: string;
}

const failureRules: [string, FailureReason, boolean, boolean][] = [
  ["INSTALL_FAILED_UPDATE_INCOMPATIBLE", "updateIncompatible", true, false],
  ["INSTALL_FAILED_VERSION_DOWNGRADE", "versionDowngrade", true, false],
  ["INSTALL_PARSE_FAILED", "parseFailed", false, true],
  ["INSTALL_FAILED_INSUFFICIENT_STORAGE", "insufficientStorage", false, false],
  ["INSTALL_FAILED_USER_RESTRICTED", "userRestricted", false, false],
  ["INSTALL_FAILED_NO_MATCHING_ABIS", "noMatchingAbis", false, false],
  ["INSTALL_FAILED_OLDER_SDK", "olderSdk", false, false],
  ["INSTALL_FAILED_TEST_ONLY", "testOnly", false, false],
  ["device offline", "deviceOffline", false, true],
  ["not found", "deviceNotFound", false, true],
];

export function parseFailure(output: string): FailureHint {
  const lower = output.toLowerCase();
  for (const [needle, reason, suggestReinstall, retryable] of failureRules) {
    if (lower.includes(needle.toLowerCase())) return { reason, suggestReinstall, retryable };
  }
  return { reason: "unknown", suggestReinstall: false, retryable: true };
}

export function logcatLevel(line: string): string {
  // "-v time": "10-13 15:04:02.123 E/Tag( 1234): message"
  const c = line.split(" ", 3)[2]?.[0];
  return c && "VDIWEF".includes(c) ? c : "I";
}

export interface RecentApp {
  pkg: string;
  versionName: string;
  lastUpdate: number;
  firstInstall: number;
}

// dumpsys prints device-local "2026-10-14 12:39:05"; the phone and the computer normally share a timezone.
const parseTime = (s: string | undefined) => (s ? new Date(s.replace(" ", "T")).getTime() || 0 : 0);

export function parseRecentApps(dump: string, thirdParty: Set<string>, limit = 10): RecentApp[] {
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
  return [...apps.values()].sort((a, b) => b.lastUpdate - a.lastUpdate).slice(0, limit);
}

import { locale } from "../i18n";

const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

export function timeAgo(ms: number): string {
  const lang = locale();
  let relative = relativeFormats.get(lang);
  if (!relative) relativeFormats.set(lang, (relative = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" })));
  const diff = (ms - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return relative.format(Math.round(diff), "second");
  if (abs < 3600) return relative.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return relative.format(Math.round(diff / 86400), "day");
  return relative.format(Math.round(diff / (86400 * 7)), "week");
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["kB", "MB", "GB"];
  let v = n / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toLocaleString(locale(), { maximumFractionDigits: 1 })} ${units[i]}`;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export const timeOfDay = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const shortTime = (d: Date) => d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

/** "4,5 MB" in Czech, "4.5 MB" in English. */
export const megabytes = (n: number) => `${n.toLocaleString(locale())} MB`;

export const fileStamp = () => new Date().toISOString().slice(0, 19).replaceAll(":", "-");

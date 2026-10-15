import { shQuote } from "./parse";

export type ExtraType = "string" | "int" | "long" | "float" | "bool";

export interface IntentExtra {
  key: string;
  type: ExtraType;
  value: string;
}

export interface DeepLink {
  id: string;
  name: string;
  url: string;
  /** Opens the link in this app directly instead of letting Android pick (`am start -p`). */
  pkg: string | null;
  extras: IntentExtra[];
}

const EXTRA_FLAGS: Record<ExtraType, string> = { string: "--es", int: "--ei", long: "--el", float: "--ef", bool: "--ez" };

/** `am start` for a VIEW intent; `-W` waits so errors (no activity found) come back in the output. */
export function startCommand(link: Pick<DeepLink, "url" | "pkg" | "extras">): string {
  const parts = ["am start -W -a android.intent.action.VIEW -d", shQuote(link.url.trim())];
  if (link.pkg) parts.push("-p", shQuote(link.pkg));
  for (const e of link.extras) {
    if (!e.key.trim()) continue;
    const value = e.type === "bool" ? (/^(1|true|yes|ano)$/i.test(e.value.trim()) ? "true" : "false") : e.value.trim();
    parts.push(EXTRA_FLAGS[e.type], shQuote(e.key.trim()), shQuote(value));
  }
  return parts.join(" ");
}

interface Filter {
  view: boolean;
  schemes: string[];
  authorities: string[];
  paths: string[];
}

/** Example URLs for the app's VIEW intent filters, from the Activity Resolver Table of `dumpsys package <pkg>`. */
export function parseAppLinks(dump: string): string[] {
  const lines = dump.split("\n");
  const start = lines.findIndex((l) => l.trim() === "Activity Resolver Table:");
  if (start < 0) return [];
  const filters: Filter[] = [];
  let current: Filter | null = null;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (/Resolver Table:$/.test(line)) break;
    if (/ filter [0-9a-f]+$/.test(line)) {
      current = { view: false, schemes: [], authorities: [], paths: [] };
      filters.push(current);
      continue;
    }
    if (!current) continue;
    const value = line.match(/^(\w+): "([^"]*)"/);
    if (!value) continue;
    const [, field, v] = value;
    if (field === "Action" && v === "android.intent.action.VIEW") current.view = true;
    else if (field === "Scheme") current.schemes.push(v);
    else if (field === "Authority") current.authorities.push(v);
    else if (field === "Path") current.paths.push(v.replace(/^PatternMatcher\{\w+: (.*)\}$/, "$1").replace(/[.*]+$/, ""));
  }
  const urls = new Set<string>();
  for (const f of filters) {
    if (!f.view) continue;
    for (const scheme of f.schemes) {
      if (!f.authorities.length) urls.add(`${scheme}://`);
      for (const host of f.authorities) {
        if (!f.paths.length) urls.add(`${scheme}://${host}`);
        for (const path of f.paths) urls.add(`${scheme}://${host}${path.startsWith("/") ? path : `/${path}`}`);
      }
    }
  }
  return [...urls].sort();
}

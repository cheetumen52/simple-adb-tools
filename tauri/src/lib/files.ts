/** Parsing of the device's toybox `ls -la` output for the file manager. */

export type EntryType = "dir" | "file" | "link";

export interface FileEntry {
  name: string;
  type: EntryType;
  size: number | null;
  /** "2026-06-26 19:13" in device time. */
  modified: string;
  target?: string;
}

const LS_LINE = /^([dlcbps-])[rwxsStT-]{9}\S*\s+\d+\s+\S+\s+\S+\s+(\d+(?:,\s*\d+)?)\s+(\d{4}-\d\d-\d\d \d\d:\d\d)\s+(.+)$/;

export function parseLs(out: string): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const line of out.split("\n")) {
    const m = line.trimEnd().match(LS_LINE);
    if (!m) continue;
    const [, kind, size, modified, rest] = m;
    let name = rest;
    let target: string | undefined;
    if (kind === "l") [name, target] = rest.split(" -> ");
    if (name === "." || name === "..") continue;
    entries.push({
      name,
      type: kind === "d" ? "dir" : kind === "l" ? "link" : "file",
      size: kind === "-" ? Number(size) : null,
      modified,
      target,
    });
  }
  // Folders first, then names without case, like Finder and Explorer.
  return entries.sort((a, b) => Number(b.type !== "file") - Number(a.type !== "file") || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function joinRemote(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

export function parentRemote(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

/** Breadcrumb segments: "/sdcard/Download" → [["sdcard", "/sdcard"], ["Download", "/sdcard/Download"]]. */
export function crumbs(path: string): [string, string][] {
  const parts = path.split("/").filter(Boolean);
  return parts.map((p, i) => [p, `/${parts.slice(0, i + 1).join("/")}`]);
}

/** A name that is safe as a single path segment on the device. */
export const validName = (name: string) => !!name.trim() && !name.includes("/") && name !== "." && name !== "..";

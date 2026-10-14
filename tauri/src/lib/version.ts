/** "v1.2.3" → [1, 2, 3]; pre-release tags like "v1.2.0-beta" are ignored. */
export function versionParts(tag: string): number[] | null {
  const parts = tag.replace(/^v/i, "").split(".");
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.map(Number);
}

export function isOlder(a: string, b: string): boolean {
  const x = versionParts(a) ?? [0];
  const y = versionParts(b) ?? [0];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const l = x[i] ?? 0;
    const r = y[i] ?? 0;
    if (l !== r) return l < r;
  }
  return false;
}

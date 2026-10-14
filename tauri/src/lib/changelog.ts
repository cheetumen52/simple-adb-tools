import rawCs from "../../../CHANGELOG.md?raw";
import rawEn from "../../../CHANGELOG.en.md?raw";
import type { Lang } from "../i18n";

export interface ChangelogGroup {
  title: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  date: string | null;
  groups: ChangelogGroup[];
}

/** Parses the Keep-a-Changelog subset used in CHANGELOG.md: `## [ver] - date`, `### Group`, `- item`. */
export function parseChangelog(text: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let group: ChangelogGroup | null = null;
  for (const line of text.split("\n")) {
    const heading = line.match(/^## \[([^\]]+)\](?:\s*-\s*(.+))?/);
    if (heading) {
      release = { version: heading[1], date: heading[2]?.trim() ?? null, groups: [] };
      releases.push(release);
      group = null;
      continue;
    }
    const sub = line.match(/^### (.+)/);
    if (sub && release) {
      group = { title: sub[1].trim(), items: [] };
      release.groups.push(group);
      continue;
    }
    const item = line.match(/^- (.+)/);
    if (item && group) group.items.push(item[1].trim());
  }
  return releases;
}

const released = (text: string) => parseChangelog(text).filter((r) => /^\d/.test(r.version));

/** Released versions only; the "Nevydáno"/"Unreleased" section is work in progress. */
export const CHANGELOG: Record<Lang, ChangelogRelease[]> = { cs: released(rawCs), en: released(rawEn) };

/**
 * Release notes carry both languages: English, then `<!-- cs -->` and Czech, optionally closed by `<!-- end -->`.
 * Notes without the marker (older releases) are returned whole.
 */
export function localizedNotes(notes: string | null | undefined, lang: Lang): string {
  const text = (notes ?? "").split("<!-- end -->")[0];
  const [english, czech] = text.split("<!-- cs -->");
  return czech === undefined ? text : lang === "cs" ? czech : english;
}

/** Bullet lines of release notes (updater body or GitHub release body). */
export function noteItems(notes: string | null | undefined): string[] {
  return (notes ?? "")
    .split("\n")
    .map((l) => l.match(/^\s*[-*] (.+)/)?.[1]?.trim())
    .filter((l): l is string => !!l && !l.startsWith("**"));
}

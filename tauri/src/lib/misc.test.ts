import { describe, expect, it } from "vitest";
import { isOlder, versionParts } from "./version";
import { CHANGELOG, noteItems, parseChangelog } from "./changelog";
import { bytes, clock } from "./format";
import { baseName, joinPath, parentDir } from "./native";
import pkg from "../../package.json";
import tauriConf from "../../src-tauri/tauri.conf.json";

describe("version comparison", () => {
  it("parses release tags and rejects pre-releases", () => {
    expect(versionParts("v1.2.3")).toEqual([1, 2, 3]);
    expect(versionParts("1.10")).toEqual([1, 10]);
    expect(versionParts("v1.2.0-beta")).toBeNull();
  });

  it("orders numerically, not lexically", () => {
    expect(isOlder("1.9.0", "1.10.0")).toBe(true);
    expect(isOlder("v1.1.1", "v1.1.1")).toBe(false);
    expect(isOlder("1.2", "1.2.0")).toBe(false);
    expect(isOlder("2.0.0", "1.99.99")).toBe(false);
  });
});

describe("changelog", () => {
  const sample = `# Changelog

## [Nevydáno]
### Přidáno
- Něco nového

## [1.1.1] - 2026-10-14
### Přidáno
- Emulátory
- Obnovit
### Opraveno
- Instalátor

## [1.1.0] - 2026-10-14
### Přidáno
- Windows
`;

  it("parses versions, dates, groups and items", () => {
    const releases = parseChangelog(sample);
    expect(releases.map((r) => r.version)).toEqual(["Nevydáno", "1.1.1", "1.1.0"]);
    expect(releases[1]).toEqual({
      version: "1.1.1",
      date: "2026-10-14",
      groups: [
        { title: "Přidáno", items: ["Emulátory", "Obnovit"] },
        { title: "Opraveno", items: ["Instalátor"] },
      ],
    });
  });

  it("bundled CHANGELOG.md has released entries and covers the app version", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(CHANGELOG.every((r) => /^\d+\.\d+\.\d+$/.test(r.version) && r.groups.length > 0)).toBe(true);
    expect(CHANGELOG.some((r) => r.version === tauriConf.version)).toBe(true);
  });

  it("extracts bullet notes and skips bold instruction lines", () => {
    expect(noteItems("### Přidáno\n- A\n- B\n\n**Windows:** setup\n* C")).toEqual(["A", "B", "C"]);
    expect(noteItems(null)).toEqual([]);
  });
});

describe("app version", () => {
  it("is the same in package.json and tauri.conf.json", () => {
    expect(pkg.version).toBe(tauriConf.version);
  });
});

describe("format", () => {
  it("formats sizes and clocks", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(80_100_000)).toBe("80,1 MB");
    expect(clock(0)).toBe("00:00");
    expect(clock(75.9)).toBe("01:15");
  });
});

describe("paths", () => {
  it("joins and splits POSIX and Windows paths", () => {
    expect(joinPath("/Users/z/Desktop/", "shot.png")).toBe("/Users/z/Desktop/shot.png");
    expect(joinPath("C:\\Users\\z\\Desktop", "shot.png")).toBe("C:\\Users\\z\\Desktop\\shot.png");
    expect(baseName("C:\\a\\b\\app-debug (1).apk")).toBe("app-debug (1).apk");
    expect(parentDir("/Users/z/Downloads/a.apk")).toBe("/Users/z/Downloads");
  });
});

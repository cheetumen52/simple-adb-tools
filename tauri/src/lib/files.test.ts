import { describe, expect, it } from "vitest";
import { crumbs, joinRemote, parentRemote, parseLs, validName } from "./files";

// `ls -la /sdcard/Download` on a Huawei MAR-LX1A (Android 10).
const HUAWEI = `total 516490
drwxrwx--x  2 root sdcard_rw     3488 2026-06-26 19:13 .
drwxrwx--x 12 root sdcard_rw     3488 2026-10-14 11:26 ..
-rw-rw----  1 root sdcard_rw 53644686 2026-04-21 10:31 Cuppka DEV-v260420580-(1.0.0).apk
-rw-rw----  1 root sdcard_rw 22409922 2026-05-27 21:22 Cuppka PROD-v260527740-(1.2.0).apk
drwxrwx--x  2 root sdcard_rw     3488 2026-07-20 12:11 .File_Recycle`;

// `ls -la /sdcard/` on an Android 17 emulator (no . and .. entries) plus a symlink line.
const EMULATOR = `total 1468
drwxrws--x 5 media_rw media_rw    4096 2026-05-07 11:36 Android
drwxrws--- 2 u0_a226  media_rw    4096 2026-05-07 11:36 Download
lrw-r--r-- 1 root root 21 2026-03-25 21:28 sdcard -> /storage/self/primary
crw-rw-rw- 1 root root   1,   3 2026-03-25 21:28 null`;

describe("file manager", () => {
  it("parses files with spaces, folders and skips . and ..", () => {
    const entries = parseLs(HUAWEI);
    expect(entries.map((e) => e.name)).toEqual([".File_Recycle", "Cuppka DEV-v260420580-(1.0.0).apk", "Cuppka PROD-v260527740-(1.2.0).apk"]);
    expect(entries[1]).toEqual({ name: "Cuppka DEV-v260420580-(1.0.0).apk", type: "file", size: 53644686, modified: "2026-04-21 10:31", target: undefined });
    expect(entries[0].type).toBe("dir");
  });

  it("reads symlinks and device nodes", () => {
    const entries = parseLs(EMULATOR);
    expect(entries.find((e) => e.name === "sdcard")).toMatchObject({ type: "link", target: "/storage/self/primary", size: null });
    expect(entries.find((e) => e.name === "null")).toMatchObject({ type: "file", size: null });
  });

  it("builds and splits device paths", () => {
    expect(joinRemote("/sdcard/", "a b.txt")).toBe("/sdcard/a b.txt");
    expect(parentRemote("/sdcard/Download/")).toBe("/sdcard");
    expect(parentRemote("/sdcard")).toBe("/");
    expect(crumbs("/sdcard/Download")).toEqual([["sdcard", "/sdcard"], ["Download", "/sdcard/Download"]]);
  });

  it("rejects names that would escape the folder", () => {
    expect(validName("report.txt")).toBe(true);
    expect(validName("../x")).toBe(false);
    expect(validName("  ")).toBe(false);
    expect(validName("..")).toBe(false);
  });
});

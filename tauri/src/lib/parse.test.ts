import { describe, expect, it } from "vitest";
import {
  apkVersion,
  compareVersions,
  distinctDevices,
  displayName,
  isEmulator,
  isReady,
  isWireless,
  logcatLevel,
  packageList,
  parseBadging,
  parseDevices,
  parseDumpsysVersion,
  parseFailure,
  parseRecentApps,
  sections,
  shQuote,
} from "./parse";
import { useI18n } from "../i18n";

// Captured from a real `adb devices -l` with a USB phone, a Wi‑Fi phone, an emulator and an unauthorized device.
const DEVICES = `List of devices attached
L2N4C20109011719       device usb:2-1 product:MAR-LX1AEEA model:MAR_LX1A device:HWMAR transport_id:1
192.168.0.102:5555     device product:MAR-LX1AEEA model:MAR_LX1A device:HWMAR transport_id:6
emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:3
RF8T70BNEMN            unauthorized usb:1-1 transport_id:4
* daemon started successfully

`;

describe("parseDevices", () => {
  const devices = parseDevices(DEVICES);

  it("keeps USB, Wi‑Fi, emulator and unauthorized devices and skips daemon noise", () => {
    expect(devices.map((d) => d.serial)).toEqual(["L2N4C20109011719", "192.168.0.102:5555", "emulator-5554", "RF8T70BNEMN"]);
  });

  it("turns the model into a readable name", () => {
    expect(devices[0].model).toBe("MAR LX1A");
    expect(displayName(devices[0])).toBe("MAR LX1A");
    useI18n.getState().setSetting("cs");
    expect(displayName(devices[3])).toBe("Neznámé zařízení");
    useI18n.getState().setSetting("en");
    expect(displayName(devices[3])).toBe("Unknown device");
  });

  it("classifies transports", () => {
    expect(devices.map(isReady)).toEqual([true, true, true, false]);
    expect(devices.map(isWireless)).toEqual([false, true, false, false]);
    expect(devices.map(isEmulator)).toEqual([false, false, true, false]);
  });

  it("treats mDNS serials as wireless", () => {
    expect(isWireless({ serial: "adb-RF8T70BNEMN-x7Yz._adb-tls-connect._tcp", state: "device", model: null })).toBe(true);
  });
});

describe("parseBadging", () => {
  it("reads package, version and label from aapt2 output", () => {
    const info = parseBadging(
      "package: name='com.cuppka.app.dev' versionCode='261008925' versionName='1.10.1' compileSdkVersion='35'\nsdkVersion:'24'\napplication-label:'Cuppka DEV'\n",
    );
    expect(info).toEqual({ label: "Cuppka DEV", pkg: "com.cuppka.app.dev", versionName: "1.10.1", versionCode: 261008925 });
    expect(apkVersion(info!)).toBe("1.10.1 (261008925)");
  });

  it("returns null for garbage", () => {
    expect(parseBadging("ERROR: dump failed because no AndroidManifest.xml found")).toBeNull();
  });
});

describe("parseDumpsysVersion + compareVersions", () => {
  const dump = "Packages:\n  Package [com.cuppka.app.dev] (64ed0a8):\n    versionCode=261008925 minSdk=24 targetSdk=35\n    versionName=1.10.1\n";
  const apk = { label: null, pkg: "com.cuppka.app.dev", versionName: "1.10.1", versionCode: 261008925 };

  it("reads the installed version", () => {
    expect(parseDumpsysVersion(dump, "com.cuppka.app.dev")).toEqual({ versionName: "1.10.1", versionCode: 261008925 });
    expect(parseDumpsysVersion("", "com.cuppka.app.dev")).toBeNull();
  });

  it("compares by versionCode", () => {
    const installed = parseDumpsysVersion(dump, apk.pkg);
    expect(compareVersions(apk, null)).toBe("notInstalled");
    expect(compareVersions(apk, installed)).toBe("same");
    expect(compareVersions({ ...apk, versionCode: 261008926 }, installed)).toBe("upgrade");
    expect(compareVersions({ ...apk, versionCode: 1 }, installed)).toBe("downgrade");
    expect(compareVersions({ ...apk, versionCode: null }, installed)).toBe("unknown");
  });
});

describe("sections + packageList", () => {
  it("splits @@-marked shell output", () => {
    const s = sections("@@third\npackage:a.b\npackage:c.d\n@@empty\n@@night\nNight mode: no\n");
    expect(packageList(s.third)).toEqual(["a.b", "c.d"]);
    expect(s.empty).toBe("");
    expect(s.night).toBe("Night mode: no");
  });
});

describe("parseRecentApps", () => {
  const dump = `  Package [com.google.android.youtube] (e110cc0):
    versionName=21.40.161
    firstInstallTime=2018-08-07 18:01:00
    lastUpdateTime=2026-10-07 10:07:05
  Package [com.cuppka.app.dev] (a):
    versionName=1.10.1
    firstInstallTime=2026-09-25 12:44:41
    lastUpdateTime=2026-10-14 12:39:05
  Package [cz.seznam.mapy] (d):
    versionName=10.2
    firstInstallTime=2025-01-02 10:00:00
    lastUpdateTime=2025-01-02 10:00:00
  Package [com.cuppka.app.dev] (hidden duplicate):
    versionName=0.0.1
`;

  it("keeps third-party apps, newest update first, ignoring duplicates", () => {
    const apps = parseRecentApps(dump, new Set(["com.cuppka.app.dev", "cz.seznam.mapy"]));
    expect(apps.map((a) => a.pkg)).toEqual(["com.cuppka.app.dev", "cz.seznam.mapy"]);
    expect(apps[0].versionName).toBe("1.10.1");
    expect(apps[1].firstInstall).toBe(apps[1].lastUpdate);
  });

  it("respects the limit", () => {
    expect(parseRecentApps(dump, new Set(["com.cuppka.app.dev", "cz.seznam.mapy"]), 1)).toHaveLength(1);
  });
});

describe("parseFailure", () => {
  it("explains signature conflicts and offers reinstall", () => {
    const hint = parseFailure("Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.x signatures do not match]");
    expect(hint.reason).toBe("updateIncompatible");
    expect(hint.suggestReinstall).toBe(true);
    expect(hint.retryable).toBe(false);
  });

  it("retries half-downloaded files", () => {
    expect(parseFailure("adb: failed to install x.apk: Failure [INSTALL_PARSE_FAILED_NOT_APK]").retryable).toBe(true);
  });

  it("falls back to a generic retryable hint", () => {
    const hint = parseFailure("adb: failed to install /tmp/x.apk:");
    expect(hint.reason).toBe("unknown");
    expect(hint.retryable).toBe(true);
    expect(hint.suggestReinstall).toBe(false);
  });
});

describe("small helpers", () => {
  it("quotes for the device shell", () => {
    expect(shQuote("it's")).toBe("'it'\\''s'");
  });

  it("reads the logcat level", () => {
    expect(logcatLevel("10-13 15:23:18.901 E/SurfaceFlingerEx(  683): boom")).toBe("E");
    expect(logcatLevel("--------- beginning of main")).toBe("I");
  });

});

describe("distinctDevices", () => {
  it("keeps one entry per phone and prefers USB over Wi-Fi", () => {
    const devices = parseDevices(`List of devices attached
192.168.0.102:5555     device product:MAR-LX1AEEA model:MAR_LX1A device:HWMAR transport_id:6
L2N4C20109011719       device usb:2-1 product:MAR-LX1AEEA model:MAR_LX1A device:HWMAR transport_id:1
emulator-5554          device product:sdk_gphone16k_arm64 model:sdk_gphone16k_arm64 transport_id:2`);
    const hw: Record<string, string> = { "192.168.0.102:5555": "L2N4C20109011719", L2N4C20109011719: "L2N4C20109011719" };
    expect(distinctDevices(devices, (s) => hw[s]).map((d) => d.serial)).toEqual(["L2N4C20109011719", "emulator-5554"]);
    expect(distinctDevices(devices, () => null)).toHaveLength(3);
  });
});

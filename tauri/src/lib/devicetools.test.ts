import { describe, expect, it } from "vitest";
import { parseAppLocales, parseBattery, parseDensity, parseFlag, parseProxy, parseRuntimePermissions, permissionLabel, reversePort } from "./devicetools";

// `dumpsys package com.cuppka.app.dev` on an Android 17 emulator (excerpt).
const PACKAGE_DUMP = `    install permissions:
      android.permission.INTERNET: granted=true
    User 0: ceDataInode=361116 deDataInode=41557 installed=true hidden=false
      gids=[3003]
      runtime permissions:
        android.permission.POST_NOTIFICATIONS: granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED|USER_SENSITIVE_WHEN_DENIED]
        android.permission.ACCESS_FINE_LOCATION: granted=true, flags=[ USER_SENSITIVE_WHEN_GRANTED|USER_SENSITIVE_WHEN_DENIED]
      disabledComponents:
        androidx.work.impl.background.systemalarm.RescheduleReceiver`;

// `dumpsys battery` on a Huawei MAR-LX1A (Android 10).
const BATTERY = `Current Battery Service state:
  AC powered: false
  USB powered: true
  Wireless powered: false
  status: 2
  health: 2
  present: true
  level: 27
  scale: 100`;

describe("device test toggles", () => {
  it("reads runtime permissions and skips install permissions", () => {
    expect(parseRuntimePermissions(PACKAGE_DUMP)).toEqual([
      { name: "android.permission.POST_NOTIFICATIONS", granted: false },
      { name: "android.permission.ACCESS_FINE_LOCATION", granted: true },
    ]);
    expect(parseRuntimePermissions("no permissions here")).toEqual([]);
    expect(permissionLabel("android.permission.POST_NOTIFICATIONS")).toBe("POST_NOTIFICATIONS");
  });

  it("reads physical and override density", () => {
    expect(parseDensity("Physical density: 420")).toEqual({ physical: 420, override: null });
    expect(parseDensity("Physical density: 420\nOverride density: 360")).toEqual({ physical: 420, override: 360 });
  });

  it("treats null, empty and :0 as no proxy and spots adb reverse proxies", () => {
    expect(parseProxy("null\n")).toBeNull();
    expect(parseProxy(":0")).toBeNull();
    expect(parseProxy("192.168.0.10:8888")).toBe("192.168.0.10:8888");
    expect(reversePort("127.0.0.1:9090")).toBe(9090);
    expect(reversePort("192.168.0.10:8888")).toBeNull();
  });

  it("reads per-app locales", () => {
    expect(parseAppLocales("Locales for com.cuppka.app.dev for user 0 are [en-US]")).toEqual(["en-US"]);
    expect(parseAppLocales("Locales for com.cuppka.app.dev for user 0 are []")).toEqual([]);
    expect(parseAppLocales("cmd: Can't find service: locale")).toBeNull();
  });

  it("reads battery level, status and power source", () => {
    expect(parseBattery(BATTERY)).toEqual({ level: 27, status: "2", plugged: true });
  });

  it("reads on/off settings", () => {
    expect(parseFlag("1")).toBe(true);
    expect(parseFlag("0\n")).toBe(false);
    expect(parseFlag("disabled")).toBe(false);
    expect(parseFlag("null")).toBeNull();
  });
});

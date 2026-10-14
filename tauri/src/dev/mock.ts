// Dev-only browser preview (`npm run dev`, open /?mock): fakes the Rust backend with real captured adb output.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

const now = Date.now();
const HUAWEI = "L2N4C20109011719";
const SAMSUNG = "RF8T70BNEMN";

const badging = (pkg: string, label: string, name: string, code: number) =>
  `package: name='${pkg}' versionCode='${code}' versionName='${name}' compileSdkVersion='35'\napplication-label:'${label}'\n`;

const overview = `@@manufacturer\nHUAWEI\n@@model\nMAR-LX1A\n@@release\n10\n@@sdk\n29\n@@abi\narm64-v8a\n@@build\nMAR-L21A 10.0.0.275(C431E8R2P7)\n@@size\nPhysical size: 1080x2312\n@@density\nPhysical density: 480\n@@battery\nCurrent Battery Service state:\n  AC powered: false\n  USB powered: true\n  status: 2\n  level: 81\n  temperature: 280\n@@storage\n/dev/block/dm-6 108G 11G 97G 11% /data\n@@ip\n33: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP>\n    inet 192.168.0.102/24 brd 192.168.0.255 scope global wlan0\n@@uptime\n 09:12:01 up 19 days,  3:12,  0 users,  load average: 1.2, 1.1, 1.0\n`;

const packages = ["com.cuppka.app", "com.cuppka.app.dev", "cz.seznam.mapy", "com.google.android.play.games", "cz.sportovec2.app.dev"];
const system = ["android", "com.android.bluetooth", "com.android.calendar", "com.huawei.calculator", "com.android.settings"];
const list = (items: string[]) => items.map((p) => `package:${p}`).join("\n");

function runTool(tool: string, args: string[]): { status: number; output: string } {
  const ok = (output: string) => ({ status: 0, output });
  if (tool === "aapt2") {
    const path = args[2] ?? "";
    if (path.includes("release")) return ok(badging("com.cuppka.app", "Cuppka", "1.9.1", 260925910));
    return ok(badging("com.cuppka.app.dev", "Cuppka DEV", path.includes("(1)") ? "1.10.1" : "1.10.0", path.includes("(1)") ? 261008925 : 261001200));
  }
  const joined = args.join(" ");
  if (joined === "devices -l")
    return ok(`List of devices attached\n${HUAWEI}       device usb:2-1 product:MAR-LX1AEEA model:MAR_LX1A device:HWMAR transport_id:1\n${SAMSUNG}            device usb:1-1 product:m13nseea model:SM_M135F device:m13 transport_id:2\nemulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:3\n`);
  if (joined.includes("getprop ro.build.version.release; getprop ro.product.manufacturer"))
    return ok(joined.includes(HUAWEI) ? `10\nHUAWEI\n${HUAWEI}\n` : joined.includes("emulator") ? `15\nGoogle\nEMULATOR35X1X11X0\n` : `14\nsamsung\n${SAMSUNG}\n`);
  if (joined.includes("dumpsys package com.cuppka.app.dev") || joined.includes("dumpsys package 'com.cuppka.app.dev'"))
    return ok(`Package [com.cuppka.app.dev] (abc):\n    versionCode=261008925 minSdk=24 targetSdk=35\n    versionName=1.10.1\n    firstInstallTime=2026-10-13 14:27:43\n    lastUpdateTime=2026-10-14 08:57:34\n`);
  if (joined.includes("dumpsys package")) return ok("");
  if (joined.includes("echo @@manufacturer")) return ok(overview);
  if (joined.includes("echo @@all")) return ok(`@@all\n${list([...packages, ...system])}\n@@third\n${list(packages)}\n@@system\n${list(system)}\n@@everything\n${list([...packages, ...system, "com.huawei.browser"])}\n`);
  if (joined.includes("echo @@touches")) return ok("@@touches\n1\n@@pointer\n0\n@@anim\n1.0\n@@night\nNight mode: no\n@@stay\n0\n@@layout\nfalse\n");
  if (joined.includes("mdns services")) return ok("List of discovered mdns services\n");
  if (joined.includes("getprop ro.build.fingerprint")) return ok("HUAWEI/MAR-LX1AEEA/HWMAR:10/HUAWEIMAR-L21A/10.0.0.275C431:user/release-keys\n");
  return ok("");
}

mockWindows("main");
mockIPC(
  (cmd, payload) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case "plugin:app|version":
        return "1.1.0";
      case "system_paths":
        return { home: "/Users/zdenek", desktop: "/Users/zdenek/Desktop", downloads: "/Users/zdenek/Downloads", platform: "macos" };
      case "toolchain_check":
        return {
          adb: { kind: "found", path: "/Users/zdenek/Library/Android/sdk/platform-tools/adb", version: "37.0.0-14910828", managed: false },
          aapt2: { kind: "found", path: "/Users/zdenek/Library/Android/sdk/build-tools/37.0.0/aapt2", version: "2.20-15087165", managed: false },
          scrcpy: new URLSearchParams(location.search).has("noscrcpy")
            ? { kind: "missing" }
            : { kind: "found", path: "/Users/zdenek/Library/Application Support/cz.hejzlar-development.simple-adb-tools/tools/scrcpy/scrcpy", version: "5.0.1", managed: true },
        };
      case "list_apks":
        return [
          { path: "/Users/zdenek/Downloads/app-debug (1).apk", name: "app-debug (1).apk", folder: "/Users/zdenek/Downloads", modifiedMs: now - 40 * 60000, size: 80_100_000 },
          { path: "/Users/zdenek/Downloads/app-debug.apk", name: "app-debug.apk", folder: "/Users/zdenek/Downloads", modifiedMs: now - 3 * 3600000, size: 82_900_000 },
          { path: "/Users/zdenek/Downloads/app-release.apk", name: "app-release.apk", folder: "/Users/zdenek/Downloads", modifiedMs: now - 26 * 3600000, size: 61_300_000 },
        ];
      case "run_tool":
        return runTool(p.tool as string, p.args as string[]);
      case "take_pending_files":
        return [];
      case "probe_tcp":
        return "timeout";
      case "path_exists":
        return false;
      default:
        return null;
    }
  },
  { shouldMockEvents: true },
);

// `?mock&update` pretends a newer release exists on GitHub.
if (new URLSearchParams(location.search).has("update")) {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) =>
    String(input).includes("api.github.com")
      ? Promise.resolve(
          new Response(
            JSON.stringify([
              { tag_name: "v1.3.0", html_url: "https://github.com/x/y/releases/tag/v1.3.0", draft: true },
              { tag_name: "v1.2.0", html_url: "https://github.com/x/y/releases/tag/v1.2.0", draft: false },
            ]),
            { status: 200 },
          ),
        )
      : realFetch(input, init);
}

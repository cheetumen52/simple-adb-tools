import { describe, expect, it } from "vitest";
import { CrashCollector, parseLogLine } from "./crash";

// Captured with `am crash com.cuppka.app.dev` on a Huawei MAR-LX1A (Android 10).
const JAVA_CRASH = `--------- beginning of crash
10-15 19:41:04.709 E/AndroidRuntime(16451): FATAL EXCEPTION: main
10-15 19:41:04.709 E/AndroidRuntime(16451): Process: com.cuppka.app.dev, PID: 16451
10-15 19:41:04.709 E/AndroidRuntime(16451): android.app.RemoteServiceException: shell-induced crash
10-15 19:41:04.709 E/AndroidRuntime(16451): \tat android.app.ActivityThread$H.handleMessage(ActivityThread.java:2540)
10-15 19:41:04.709 E/AndroidRuntime(16451): \tat android.os.Looper.loop(Looper.java:219)
10-15 19:41:05.618 E/ActivityManager( 1637): do not add repeated dropbox, mLastAppCrashedPid==16451`;

// SIGSEGV sent via run-as on an Android 17 emulator (registers trimmed).
const NATIVE_CRASH = `10-15 19:41:49.631 F/libc    ( 7553): Fatal signal 11 (SIGSEGV), code 0 (SI_USER from pid 7737, uid 10247) in tid 7553 (.cuppka.app.dev), pid 7553 (.cuppka.app.dev)
10-15 19:41:50.155 F/DEBUG   ( 7742): *** *** *** *** *** *** *** *** *** *** *** *** *** *** *** ***
10-15 19:41:50.155 F/DEBUG   ( 7742): Build fingerprint: 'google/sdk_gphone16k_arm64/emu64a16k:17/CP21.260306.017.A1/15087165:user/dev-keys'
10-15 19:41:50.155 F/DEBUG   ( 7742): pid: 7553, ppid: 431, tid: 7553, name: .cuppka.app.dev  >>> com.cuppka.app.dev <<<
10-15 19:41:50.155 F/DEBUG   ( 7742): signal 11 (SIGSEGV), code 0 (SI_USER from pid 7737, uid 10247), fault addr --------
10-15 19:41:50.155 F/DEBUG   ( 7742): backtrace:
10-15 19:41:50.155 F/DEBUG   ( 7742):       #00 pc 00000000000d9448  /apex/com.android.runtime/lib64/bionic/libc.so (__epoll_pwait+8)`;

// Frozen app + touch input on the Android 17 emulator.
const ANR = `10-15 19:42:30.023 E/ActivityManager(  650): Aborted stack trace dump (current primary pid=7781); deadline exceeded.
10-15 19:42:30.461 E/ActivityManager(  650): ANR in com.cuppka.app.dev (com.cuppka.app.dev/com.cuppka.app.system.MainActivity)
10-15 19:42:30.461 E/ActivityManager(  650): PID: 7781
10-15 19:42:30.461 E/ActivityManager(  650): Reason: Input dispatching timed out (4c3dd0c com.cuppka.app.dev/com.cuppka.app.system.MainActivity is not responding. Waited 5003ms for MotionEvent).
10-15 19:42:30.461 E/ActivityManager(  650): Frozen: false
10-15 19:42:30.461 E/ActivityManager(  650): Load: 0.34 / 0.82 / 0.82
10-15 19:42:30.461 E/ActivityManager(  650): ----- Output from /proc/pressure/memory -----`;

const collect = (text: string) => {
  const c = new CrashCollector();
  return [...text.split("\n").flatMap((l) => c.push(l)), ...c.flush()];
};

describe("crash detection", () => {
  it("parses logcat lines", () => {
    expect(parseLogLine("10-15 19:41:04.709 E/AndroidRuntime(16451): FATAL EXCEPTION: main")).toEqual({
      time: "10-15 19:41:04.709",
      tag: "AndroidRuntime",
      pid: 16451,
      msg: "FATAL EXCEPTION: main",
    });
    expect(parseLogLine("--------- beginning of crash")).toBeNull();
  });

  it("reads a Java crash with package, pid, exception and stack", () => {
    const [e, ...rest] = collect(JAVA_CRASH);
    expect(rest).toEqual([]);
    expect(e).toMatchObject({ kind: "crash", pkg: "com.cuppka.app.dev", pid: 16451, time: "10-15 19:41:04.709" });
    expect(e.title).toBe("android.app.RemoteServiceException: shell-induced crash");
    expect(e.lines).toHaveLength(5);
  });

  it("merges the libc signal with the debuggerd block of a native crash", () => {
    const events = collect(NATIVE_CRASH);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "native", pkg: "com.cuppka.app.dev", pid: 7553 });
    expect(events[0].title).toMatch(/^signal 11 \(SIGSEGV\)/);
    expect(events[0].lines.at(-1)).toContain("#00 pc");
  });

  it("falls back to the signal line when no debuggerd block arrives", () => {
    const [e] = collect(NATIVE_CRASH.split("\n")[0]);
    expect(e).toMatchObject({ kind: "native", pkg: ".cuppka.app.dev", pid: 7553 });
  });

  it("reads an ANR reason and stops before the CPU dump", () => {
    const [e, ...rest] = collect(ANR);
    expect(rest).toEqual([]);
    expect(e).toMatchObject({ kind: "anr", pkg: "com.cuppka.app.dev", pid: 7781 });
    expect(e.title).toMatch(/^Input dispatching timed out/);
    expect(e.lines.some((l) => l.startsWith("-----"))).toBe(false);
  });

  it("splits back-to-back crashes from different processes", () => {
    const second = JAVA_CRASH.replaceAll("16451", "16999").replace("com.cuppka.app.dev", "cz.example");
    const events = collect(`${JAVA_CRASH}\n${second}`);
    expect(events.map((e) => e.pkg)).toEqual(["com.cuppka.app.dev", "cz.example"]);
  });
});

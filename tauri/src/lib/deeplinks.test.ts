import { describe, expect, it } from "vitest";
import { parseAppLinks, startCommand } from "./deeplinks";

// `dumpsys package com.cuppka.app.dev` on an Android 17 emulator (excerpt).
const DUMP = `Activity Resolver Table:
  Schemes:
      cuppka:
        4455205 com.cuppka.app.dev/com.cuppka.app.system.MainActivity filter 8cbbc8b
          Action: "android.intent.action.VIEW"
          Category: "android.intent.category.DEFAULT"
          Category: "android.intent.category.BROWSABLE"
          Scheme: "cuppka"
          Authority: "verify-email": -1
        4455205 com.cuppka.app.dev/com.cuppka.app.system.MainActivity filter 4ce0981
          Action: "android.intent.action.VIEW"
          Scheme: "cuppka"
          Authority: "payment": -1
          Path: "PatternMatcher{PREFIX: /result}"
  Non-Data Actions:
      android.intent.action.MAIN:
        4455205 com.cuppka.app.dev/com.cuppka.app.system.MainActivity filter 1a2b3c4
          Action: "android.intent.action.MAIN"
          Category: "android.intent.category.LAUNCHER"

Receiver Resolver Table:
  Non-Data Actions:
      com.example.PUSH:
        1111111 com.cuppka.app.dev/.Receiver filter 5d5d5d5
          Action: "android.intent.action.VIEW"
          Scheme: "ignored"`;

describe("deep links", () => {
  it("lists the app's VIEW links and skips receivers and launcher filters", () => {
    expect(parseAppLinks(DUMP)).toEqual(["cuppka://payment/result", "cuppka://verify-email"]);
    expect(parseAppLinks("no table")).toEqual([]);
  });

  it("builds am start with target app and typed extras", () => {
    const cmd = startCommand({
      url: " cuppka://payment/result?id=1 ",
      pkg: "com.cuppka.app.dev",
      extras: [
        { key: "orderId", type: "int", value: "42" },
        { key: "promo", type: "bool", value: "ano" },
        { key: "note", type: "string", value: "it's ok" },
        { key: " ", type: "string", value: "skipped" },
      ],
    });
    expect(cmd).toBe(
      "am start -W -a android.intent.action.VIEW -d 'cuppka://payment/result?id=1' -p 'com.cuppka.app.dev' --ei 'orderId' '42' --ez 'promo' 'true' --es 'note' 'it'\\''s ok'",
    );
  });

  it("lets Android pick the app when none is set", () => {
    expect(startCommand({ url: "https://example.com", pkg: null, extras: [] })).toBe("am start -W -a android.intent.action.VIEW -d 'https://example.com'");
  });
});

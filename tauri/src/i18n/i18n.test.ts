import { describe, expect, it } from "vitest";
import { cs } from "./cs";
import { en } from "./en";
import { systemLang } from ".";

/** Leaf paths with the arity of message functions, e.g. "header.installTitle()1". */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "function") return [`${path}()${value.length}`];
  if (Array.isArray(value)) return [`${path}[${value.length}]`];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
  return [path];
}

describe("translations", () => {
  it("English has exactly the Czech keys", () => {
    expect(shape(en).sort()).toEqual(shape(cs).sort());
  });

  it("has no empty texts", () => {
    const strings = (value: unknown): string[] =>
      typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
    expect([...strings(cs), ...strings(en)].filter((s) => !s.trim())).toEqual([]);
  });

  it("formats device uptime", () => {
    expect(cs.format.uptime("19 days")).toBe("19 dní");
    expect(cs.format.uptime("3 days")).toBe("3 dny");
    expect(cs.format.uptime("1 day")).toBe("1 den");
    expect(en.format.uptime("1 day")).toBe("1 day");
    expect(en.format.uptime("3 days")).toBe("3 days");
    expect(cs.format.uptime("42 min")).toBe("42 min");
    expect(en.format.uptime("3:12")).toBe("3:12 h");
  });
});

describe("system language", () => {
  it("takes the first supported language from the OS list", () => {
    expect(systemLang(["cs-CZ", "en-US"])).toBe("cs");
    expect(systemLang(["sk-SK"])).toBe("cs");
    expect(systemLang(["de-DE", "en-GB", "cs"])).toBe("en");
    expect(systemLang(["de-DE", "cs-CZ"])).toBe("cs");
    expect(systemLang(["fr-FR"])).toBe("en");
    expect(systemLang([])).toBe("en");
  });
});

import { describe, expect, it } from "vitest";
import { cleanModelString, parseModelJson } from "./model-json";

describe("parseModelJson", () => {
  it("reads plain JSON objects", () => {
    expect(parseModelJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips Markdown fences and reasoning blocks", () => {
    expect(parseModelJson('<think>hmm {x}</think>\n```json\n{"a": [1]}\n```')).toEqual({
      a: [1],
    });
  });

  it("extracts the object from surrounding text", () => {
    expect(parseModelJson('Aqui está: {"ok": true}. Pronto.')).toEqual({ ok: true });
  });

  it("rejects non-objects", () => {
    expect(() => parseModelJson("[1, 2]")).toThrow();
    expect(() => parseModelJson("sem json")).toThrow();
  });
});

describe("cleanModelString", () => {
  it("collapses whitespace and limits length", () => {
    expect(cleanModelString("  a \n  b  ", 10)).toBe("a b");
    expect(cleanModelString("abcdef", 3)).toBe("abc");
    expect(cleanModelString("   ")).toBeNull();
    expect(cleanModelString(42)).toBeNull();
  });
});

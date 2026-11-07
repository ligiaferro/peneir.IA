import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("keeps internal paths", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/dashboard?tab=docs#perfil")).toBe("/dashboard?tab=docs#perfil");
  });

  it("falls back for missing or external destinations", () => {
    for (const value of [
      null,
      undefined,
      "",
      "dashboard",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
    ]) {
      expect(safeRedirectPath(value)).toBe("/dashboard");
    }
  });
});

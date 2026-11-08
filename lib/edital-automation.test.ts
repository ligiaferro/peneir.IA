import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAutomaticallyReadEdital } from "./edital-automation";

describe("shouldAutomaticallyReadEdital", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a strict 50 percent threshold by default", () => {
    vi.stubEnv("EDITAL_AUTO_READ_MIN_SIMILARITY_PERCENT", "");
    expect(shouldAutomaticallyReadEdital(0.5)).toBe(false);
    expect(shouldAutomaticallyReadEdital(0.501)).toBe(true);
  });

  it("supports a configured percentage", () => {
    vi.stubEnv("EDITAL_AUTO_READ_MIN_SIMILARITY_PERCENT", "70");
    expect(shouldAutomaticallyReadEdital(0.7)).toBe(false);
    expect(shouldAutomaticallyReadEdital(0.71)).toBe(true);
  });

  it("rejects invalid configuration", () => {
    vi.stubEnv("EDITAL_AUTO_READ_MIN_SIMILARITY_PERCENT", "101");
    expect(() => shouldAutomaticallyReadEdital(0.8)).toThrow(
      "EDITAL_AUTO_READ_MIN_SIMILARITY_PERCENT",
    );
  });
});

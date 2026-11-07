import { describe, expect, it } from "vitest";
import { getExpiryWarnings } from "./expiry";

describe("getExpiryWarnings", () => {
  const today = new Date("2026-11-07T10:00:00.000Z");

  it("flags a date that has passed", () => {
    expect(getExpiryWarnings("2026-11-06", today)).toEqual([
      "A validade informada (2026-11-06) já passou. Confirme a data no documento.",
    ]);
  });

  it("flags an expiry within 30 days", () => {
    expect(getExpiryWarnings("2026-11-08", today)).toEqual([
      "A validade informada termina em 1 dia (2026-11-08).",
    ]);
  });

  it("does not flag a distant expiry or a missing date", () => {
    expect(getExpiryWarnings("2026-12-20", today)).toEqual([]);
    expect(getExpiryWarnings(null, today)).toEqual([]);
  });

  it("reports an invalid calendar date for human review", () => {
    expect(getExpiryWarnings("2026-02-31", today)).toHaveLength(1);
  });
});

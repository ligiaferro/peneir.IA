import { describe, expect, it } from "vitest";
import { brazilianStateCodes, isBrazilianState, normalizeStates } from "./states";

describe("brazilian states", () => {
  it("lists the 27 federative units", () => {
    expect(brazilianStateCodes).toHaveLength(27);
    expect(isBrazilianState("PE")).toBe(true);
    expect(isBrazilianState("pe")).toBe(false);
    expect(isBrazilianState("toString")).toBe(false);
  });

  it("normalizes, deduplicates and sorts states", () => {
    expect(normalizeStates([" sp", "PE", "", "pe", "XX", "ba"])).toEqual({
      states: ["BA", "PE", "SP"],
      invalid: ["XX"],
    });
  });
});

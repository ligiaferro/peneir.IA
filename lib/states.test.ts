import { describe, expect, it } from "vitest";
import { brazilianRegions, brazilianStateCodes, normalizeStates } from "./states";

describe("brazilianRegions", () => {
  it("cobre as 27 UFs, cada uma em uma única região", () => {
    const all = brazilianRegions.flatMap((region) => [...region.states]);
    expect(all).toHaveLength(brazilianStateCodes.length);
    expect(new Set(all)).toEqual(new Set(brazilianStateCodes));
  });
});

describe("normalizeStates", () => {
  it("normaliza, remove repetidas e separa as inválidas", () => {
    expect(normalizeStates([" pe", "SP", "pe", "XX", ""])).toEqual({
      states: ["PE", "SP"],
      invalid: ["XX"],
    });
  });
});

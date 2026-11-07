import { describe, expect, it } from "vitest";
import { getMatchingOpportunities } from "./opportunities";

describe("getMatchingOpportunities", () => {
  it("filters by selected categories", () => {
    const results = getMatchingOpportunities({
      categories: ["doutorado"],
      keywords: [],
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.category === "doutorado")).toBe(true);
  });

  it("filters by category and case-insensitive keywords", () => {
    const results = getMatchingOpportunities({
      categories: ["licitacoes"],
      keywords: ["INFORMÁTICA"],
    });
    expect(results.map((item) => item.id)).toEqual(["mock-pncp-001"]);
  });

  it("does not return an opportunity when a supplied keyword is unmatched", () => {
    expect(
      getMatchingOpportunities({
        categories: ["bolsas"],
        keywords: ["odontologia"],
      }),
    ).toEqual([]);
  });

  it("returns no opportunities when no category is selected", () => {
    expect(
      getMatchingOpportunities({ categories: [], keywords: [] }),
    ).toEqual([]);
  });

  it("matches keywords against locations", () => {
    const results = getMatchingOpportunities({
      categories: ["concursos"],
      keywords: ["petrolina"],
    });
    expect(results.map((item) => item.id)).toEqual(["mock-concurso-002"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  getSearchCategories,
  isOpportunityCategory,
  normalizeSearchText,
} from "./opportunities";

describe("getSearchCategories", () => {
  it("uses the selected categories, or all of them when none is selected", () => {
    expect(getSearchCategories({ categories: ["bolsas"] })).toEqual(["bolsas"]);
    expect(getSearchCategories({ categories: [] })).toEqual([
      "licitacoes",
      "concursos",
      "doutorado",
      "bolsas",
    ]);
  });
});

describe("isOpportunityCategory", () => {
  it("accepts only known categories", () => {
    expect(isOpportunityCategory("licitacoes")).toBe(true);
    expect(isOpportunityCategory("outra")).toBe(false);
  });
});

describe("normalizeSearchText", () => {
  it("removes diacritics and lowercases", () => {
    expect(normalizeSearchText("  Pregão ELETRÔNICO ")).toBe("pregao eletronico");
  });
});

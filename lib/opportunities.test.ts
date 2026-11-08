import { describe, expect, it } from "vitest";
import {
  getSearchCategories,
  isOpportunityCategory,
  normalizeSearchText,
} from "./opportunities";

describe("getSearchCategories", () => {
  it("uses the selected categories, or all of them when none is selected", () => {
    expect(getSearchCategories({ categories: ["licitacoes"] })).toEqual(["licitacoes"]);
    expect(getSearchCategories({ categories: [] })).toEqual(["licitacoes"]);
  });

  it("ignores categories that no longer exist in old profiles", () => {
    const stale = ["doutorado", "bolsas"] as never;
    expect(getSearchCategories({ categories: stale })).toEqual(["licitacoes"]);
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

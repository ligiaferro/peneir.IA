import { describe, expect, it } from "vitest";
import {
  getMatchingOpportunities,
  getSearchCategories,
  normalizeSearchText,
} from "./opportunities";
import type { Opportunity } from "./types";

const bidding: Opportunity = {
  id: "pncp:00000000000191-1-000001/2026",
  source: "pncp",
  title: "AQUISIÇÃO DE MATERIAIS DE INFORMATICA",
  organization: "Prefeitura Municipal de Recife",
  category: "licitacoes",
  location: "Recife, PE",
  summary: "Compra de notebooks e periféricos.",
  tags: ["pregão - eletrônico"],
  requirements: [],
  requirementsAreGeneric: true,
  deadline: "2026-12-03T13:00:00.000Z",
  publishedAt: "2026-11-06T12:00:00.000Z",
  firstSeenAt: "2026-11-07T10:00:00.000Z",
  sourceUrl: "https://pncp.gov.br/app/editais/00000000000191/2026/1",
  uf: "PE",
};
const opportunities = [bidding];

describe("getMatchingOpportunities", () => {
  it("filters by the profile states", () => {
    const saoPaulo = { ...bidding, id: "pncp:sp", uf: "SP", location: "São Paulo, SP" };
    const national = { ...bidding, id: "pncp:br", uf: null, location: "Brasil" };
    const pool = [bidding, saoPaulo, national];
    const ids = (states: string[]) =>
      getMatchingOpportunities({ categories: ["licitacoes"], keywords: [], states }, pool)
        .map((item) => item.id);

    expect(ids(["SP"])).toEqual(["pncp:sp", "pncp:br"]);
    expect(ids(["PE", "SP"])).toEqual([bidding.id, "pncp:sp", "pncp:br"]);
    expect(ids([])).toEqual([bidding.id, "pncp:sp", "pncp:br"]);
  });

  it("returns no matches for categories without real opportunities", () => {
    const results = getMatchingOpportunities(
      { categories: ["doutorado"], keywords: [] },
      opportunities,
    );
    expect(results).toEqual([]);
  });

  it("ignores case and accents in keywords", () => {
    for (const keyword of ["INFORMÁTICA", "informatica", " Informática "]) {
      const results = getMatchingOpportunities(
        { categories: ["licitacoes"], keywords: [keyword] },
        opportunities,
      );
      expect(results.map((item) => item.id)).toEqual([bidding.id]);
    }
  });

  it("does not return an opportunity when a supplied keyword is unmatched", () => {
    expect(
      getMatchingOpportunities(
        { categories: ["bolsas"], keywords: ["odontologia"] },
        opportunities,
      ),
    ).toEqual([]);
  });

  it("returns no opportunities when neither category nor keyword is set", () => {
    expect(
      getMatchingOpportunities({ categories: [], keywords: [] }, opportunities),
    ).toEqual([]);
    expect(
      getMatchingOpportunities({ categories: [], keywords: ["  "] }, opportunities),
    ).toEqual([]);
  });

  it("searches every category by keyword when no category is selected", () => {
    const results = getMatchingOpportunities(
      { categories: [], keywords: ["informática"] },
      opportunities,
    );
    expect(results.map((item) => item.id)).toEqual([bidding.id]);
  });

  it("matches keywords against locations", () => {
    const results = getMatchingOpportunities(
      { categories: ["licitacoes"], keywords: ["recife"] },
      opportunities,
    );
    expect(results.map((item) => item.id)).toEqual([bidding.id]);
  });

  it("does not return example opportunities when no real records exist", () => {
    expect(
      getMatchingOpportunities(
        { categories: ["concursos", "doutorado", "bolsas"], keywords: [] },
        [],
      ),
    ).toEqual([]);
  });
});

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

describe("normalizeSearchText", () => {
  it("removes diacritics and lowercases", () => {
    expect(normalizeSearchText("  Pregão ELETRÔNICO ")).toBe("pregao eletronico");
  });
});

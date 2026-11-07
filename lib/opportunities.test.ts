import { describe, expect, it } from "vitest";
import {
  getDemoOpportunities,
  getMatchingOpportunities,
  normalizeSearchText,
} from "./opportunities";
import type { Opportunity } from "./types";

const now = new Date("2026-11-07T15:00:00.000Z");

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
};
const opportunities = [bidding, ...getDemoOpportunities(now)];

describe("getMatchingOpportunities", () => {
  it("filters by selected categories", () => {
    const results = getMatchingOpportunities(
      { categories: ["doutorado"], keywords: [] },
      opportunities,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.category === "doutorado")).toBe(true);
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

  it("returns no opportunities when no category is selected", () => {
    expect(
      getMatchingOpportunities({ categories: [], keywords: [] }, opportunities),
    ).toEqual([]);
  });

  it("matches keywords against locations", () => {
    const results = getMatchingOpportunities(
      { categories: ["concursos"], keywords: ["petrolina"] },
      opportunities,
    );
    expect(results.map((item) => item.id)).toEqual(["mock-concurso-002"]);
  });
});

describe("getDemoOpportunities", () => {
  it("keeps demo deadlines in the future relative to the current date", () => {
    for (const reference of [now, new Date("2027-06-01T12:00:00.000Z")]) {
      const demo = getDemoOpportunities(reference);
      expect(demo.length).toBeGreaterThan(0);
      expect(demo.every((item) => item.source === "demo")).toBe(true);
      expect(
        demo.every((item) => new Date(item.deadline) > reference),
      ).toBe(true);
    }
  });

  it("does not include bidding opportunities, which come from PNCP", () => {
    expect(
      getDemoOpportunities(now).some((item) => item.category === "licitacoes"),
    ).toBe(false);
  });
});

describe("normalizeSearchText", () => {
  it("removes diacritics and lowercases", () => {
    expect(normalizeSearchText("  Pregão ELETRÔNICO ")).toBe("pregao eletronico");
  });
});

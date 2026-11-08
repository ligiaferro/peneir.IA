import { describe, expect, it } from "vitest";
import { dashboardHref, hasActiveFilters, parseDashboardFilters } from "./dashboard-filters";

describe("parseDashboardFilters", () => {
  it("reads valid values", () => {
    const filters = parseDashboardFilters(
      { q: "  notebook   recife ", uf: "pe", prazo: "15", ordem: "prazo", pagina: "3" },
      ["PE", "PB"],
    );
    expect(filters).toEqual({
      query: "notebook recife",
      uf: "PE",
      deadlineDays: 15,
      order: "prazo",
      page: 3,
    });
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("ignores invalid or disallowed values", () => {
    const filters = parseDashboardFilters(
      { uf: "SP", prazo: "9", ordem: "preco", pagina: "-2", q: ["a", "b"] },
      ["PE"],
    );
    expect(filters).toEqual({ query: "a", uf: "", deadlineDays: null, order: "relevancia", page: 1 });
    expect(hasActiveFilters({ ...filters, query: "" })).toBe(false);
  });
});

describe("dashboardHref", () => {
  it("keeps filters and changes the page", () => {
    const filters = parseDashboardFilters({ q: "obra", uf: "PE" }, ["PE"]);
    expect(dashboardHref(filters, { page: 2 })).toBe("/dashboard?q=obra&uf=PE&pagina=2#oportunidades");
    expect(dashboardHref({ ...filters, query: "", uf: "" })).toBe("/dashboard#oportunidades");
  });
});

import { describe, expect, it } from "vitest";
import { parseEditalInsights } from "./edital-insights";
import { withEditalRequirements } from "./edital-store";
import { selectEditalExcerpt } from "./edital-text";
import type { Opportunity } from "./types";

describe("parseEditalInsights", () => {
  it("normalizes the model output", () => {
    const insights = parseEditalInsights(
      "```json\n" +
        JSON.stringify({
          resumo: "  Pregão para aquisição de   notebooks. ",
          campos: { criterioJulgamento: "Menor preço por item", garantia: "", inexistente: "x" },
          requisitos: [
            { documento: "CNDT", categoria: "fiscal", detalhe: "Item 9.2" },
            { documento: "cndt", categoria: "fiscal" },
            { documento: "Atestado de capacidade técnica", categoria: "invalida" },
            { documento: "" },
            "texto solto",
          ],
          alertas: ["Garantia de 5%", 42],
        }) +
        "\n```",
    );
    expect(insights.resumo).toBe("Pregão para aquisição de notebooks.");
    expect(insights.campos.criterioJulgamento).toBe("Menor preço por item");
    expect(insights.campos.garantia).toBeNull();
    expect(insights.campos.visitaTecnica).toBeNull();
    expect(insights.campos).not.toHaveProperty("inexistente");
    expect(insights.requisitos).toEqual([
      { documento: "CNDT", categoria: "fiscal", detalhe: "Item 9.2" },
      { documento: "Atestado de capacidade técnica", categoria: "outros", detalhe: null },
    ]);
    expect(insights.alertas).toEqual(["Garantia de 5%"]);
  });

  it("rejects output without summary or requirements", () => {
    expect(() => parseEditalInsights('{"resumo": "x"}')).toThrow();
    expect(() => parseEditalInsights('{"requisitos": []}')).toThrow();
    expect(() => parseEditalInsights("não é json")).toThrow();
  });
});

describe("selectEditalExcerpt", () => {
  it("returns short texts unchanged", () => {
    expect(selectEditalExcerpt("edital curto", 100)).toBe("edital curto");
  });

  it("keeps the beginning and the sections about habilitação", () => {
    const filler = "Cláusula sem relação com o tema. ".repeat(3_000);
    const text = `INÍCIO DO EDITAL ${filler}DA HABILITAÇÃO: certidão de regularidade fiscal e atestado de capacidade técnica. ${filler}`;
    const excerpt = selectEditalExcerpt(text, 30_000);
    expect(excerpt.length).toBeLessThanOrEqual(30_000 + 20);
    expect(excerpt.startsWith("INÍCIO DO EDITAL")).toBe(true);
    expect(excerpt).toContain("DA HABILITAÇÃO");
    expect(excerpt).toContain("[...]");
  });
});

describe("withEditalRequirements", () => {
  const opportunity = {
    requirements: ["Habilitação jurídica"],
    requirementsAreGeneric: true,
  } as Opportunity;

  it("uses only the requirements extracted from the edital", () => {
    const result = withEditalRequirements(opportunity, {
      status: "ready",
      files: [],
      insights: null,
      requirements: ["CNDT", "Balanço patrimonial"],
      processedAt: null,
      error: null,
    });
    expect(result.requirements).toEqual(["CNDT", "Balanço patrimonial"]);
    expect(result.requirementsAreGeneric).toBe(false);
  });

  it("keeps the previous edital requirements while it is being re-read", () => {
    const result = withEditalRequirements(opportunity, {
      status: "processing",
      files: [],
      insights: null,
      requirements: ["CNDT"],
      processedAt: null,
      error: null,
    });
    expect(result.requirements).toEqual(["CNDT"]);
  });

  it("uses an empty list when the completed reading found no requirements", () => {
    expect(
      withEditalRequirements(opportunity, {
        status: "ready", files: [], insights: null, requirements: [], processedAt: null, error: null,
      }),
    ).toMatchObject({ requirements: [], requirementsAreGeneric: false });
  });

  it("keeps the generic list when the edital is not ready", () => {
    expect(withEditalRequirements(opportunity, null)).toBe(opportunity);
    expect(
      withEditalRequirements(opportunity, {
        status: "processing", files: [], insights: null, requirements: [], processedAt: null, error: null,
      }),
    ).toBe(opportunity);
  });
});

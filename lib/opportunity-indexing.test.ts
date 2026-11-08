import { describe, expect, it } from "vitest";
import {
  isAboveSemanticMatchThreshold,
  minimumOpportunitySimilarity,
} from "@/lib/ai";
import {
  buildOpportunityEmbeddingText,
  buildProfileEmbeddingText,
} from "@/lib/opportunity-indexing";
import {
  isGreatMatchScore,
  similarityToPercentage,
} from "@/lib/similarity";

describe("semantic opportunity indexing", () => {
  it("builds a profile vector input from services and search terms", () => {
    expect(
      buildProfileEmbeddingText("Fornecimento de merenda escolar", [
        "alimentação coletiva",
        "PE",
      ]),
    ).toBe("Fornecimento de merenda escolar\nalimentação coletiva, PE");
  });

  it("embeds the opportunity's source description rather than card boilerplate", () => {
    const opportunity = {
      title: "Fornecimento de refeições escolares",
      summary: "Preparação e entrega de merenda escolar.",
      tags: ["pregão eletrônico"],
      organization: "Secretaria Municipal de Educação",
      location: "Recife, PE",
      deadline: "2026-12-01",
      requirements: ["Habilitação jurídica"],
    };

    expect(buildOpportunityEmbeddingText(opportunity)).toBe(
      "Fornecimento de refeições escolares\nPreparação e entrega de merenda escolar.\npregão eletrônico",
    );
  });

  it("accepts a close product match and rejects a distant category match", () => {
    expect(minimumOpportunitySimilarity).toBe(0.4);
    expect(isAboveSemanticMatchThreshold(0.81)).toBe(true);
    expect(isAboveSemanticMatchThreshold(0.12)).toBe(false);
    expect(isAboveSemanticMatchThreshold(Number.NaN)).toBe(false);
  });

  it("formats scores and marks only scores above 80% as great matches", () => {
    expect(similarityToPercentage(0.876)).toBe(88);
    expect(similarityToPercentage(-0.2)).toBe(0);
    expect(isGreatMatchScore(0.801)).toBe(true);
    expect(isGreatMatchScore(0.8)).toBe(false);
  });
});

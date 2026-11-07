import { describe, expect, it } from "vitest";
import { getDocumentSuggestions } from "./document-suggestions";

describe("getDocumentSuggestions", () => {
  it("suggests documents for selected opportunity categories", () => {
    expect(getDocumentSuggestions(["doutorado"], [])).toContain(
      "Projeto de pesquisa",
    );
  });

  it("adds relevant documents based on keywords without duplicates", () => {
    const suggestions = getDocumentSuggestions(
      ["licitacoes"],
      ["Engenharia", "pesquisa"],
    );

    expect(suggestions).toContain("Registro profissional no CREA ou CAU");
    expect(suggestions).toContain("Projeto ou plano de pesquisa");
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });
});

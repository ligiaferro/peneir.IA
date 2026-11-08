import { describe, expect, it } from "vitest";
import { getDocumentSuggestions } from "./document-suggestions";

describe("getDocumentSuggestions", () => {
  it("suggests documents for selected opportunity categories", () => {
    expect(getDocumentSuggestions(["licitacoes"], [])).toContain(
      "Comprovante de inscrição no CNPJ",
    );
  });

  it("adds relevant documents based on keywords without duplicates", () => {
    const suggestions = getDocumentSuggestions(
      ["licitacoes"],
      ["Engenharia", "obra"],
    );

    expect(suggestions).toContain("Registro profissional no CREA ou CAU");
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });
});

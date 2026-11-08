import { describe, expect, it } from "vitest";
import { suggestDocumentsForRequirement } from "./document-matching";
import type { UserDocument } from "./types";

function document(
  overrides: Partial<UserDocument> & Pick<UserDocument, "document_type" | "name">,
): UserDocument {
  return {
    id: overrides.id ?? overrides.name,
    user_id: "user-1",
    opportunity_id: null,
    document_type: overrides.document_type,
    name: overrides.name,
    expires_at: overrides.expires_at ?? null,
    storage_path: `${overrides.id ?? overrides.name}.pdf`,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("suggestDocumentsForRequirement", () => {
  it("ranks documents by matching their type to the requirement", () => {
    const suggestions = suggestDocumentsForRequirement(
      "Regularidade fiscal, social e trabalhista",
      [
        document({
          name: "certidao-fiscal.pdf",
          document_type: "Certidões de regularidade fiscal e trabalhista",
        }),
        document({
          name: "curriculo.pdf",
          document_type: "Currículo",
        }),
      ],
      "2026-11-07",
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].matchingTerms).toEqual(
      expect.arrayContaining(["regularidade", "fiscal", "trabalhista"]),
    );
  });

  it("uses filename terms when the saved document type is generic", () => {
    const suggestions = suggestDocumentsForRequirement(
      "Habilitação jurídica (ato constitutivo e inscrição no CNPJ)",
      [
        document({
          name: "comprovante-inscricao-cnpj.pdf",
          document_type: "Outro",
        }),
      ],
      "2026-11-07",
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].matchingTerms).toContain("cnpj");
  });

  it("excludes expired documents and retains documents without a recorded expiry", () => {
    const suggestions = suggestDocumentsForRequirement(
      "Regularidade fiscal e trabalhista",
      [
        document({
          name: "certidao-expirada.pdf",
          document_type: "Certidão de regularidade fiscal e trabalhista",
          expires_at: "2026-11-06",
        }),
        document({
          name: "certidao-sem-validade.pdf",
          document_type: "Certidão de regularidade fiscal e trabalhista",
        }),
      ],
      "2026-11-07",
    );

    expect(suggestions.map(({ document: item }) => item.name)).toEqual([
      "certidao-sem-validade.pdf",
    ]);
  });

  it("does not suggest documents with unrelated metadata", () => {
    const suggestions = suggestDocumentsForRequirement(
      "Qualificação técnica (atestados de capacidade técnica)",
      [
        document({
          name: "diploma.pdf",
          document_type: "Comprovante de escolaridade",
        }),
      ],
      "2026-11-07",
    );

    expect(suggestions).toEqual([]);
  });
});

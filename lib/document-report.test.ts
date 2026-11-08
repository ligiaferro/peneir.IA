import { describe, expect, it } from "vitest";
import {
  parseDocumentMatches,
  sortReportDocuments,
  summarizeRequirementCoverage,
  type ReportInputDocument,
  type ReportInputRequirement,
} from "./document-report";

const documents: ReportInputDocument[] = [
  { key: "D1", id: "doc-cnpj", name: "cnpj.pdf", documentType: "Cartão CNPJ", hasText: true },
  { key: "D2", id: "doc-fgts", name: "fgts.pdf", documentType: "CRF FGTS", hasText: false },
  { key: "D3", id: "doc-foto", name: "foto.pdf", documentType: "Outro", hasText: true },
];

const requirements: ReportInputRequirement[] = [
  { key: "R1", requirement: { documento: "Inscrição no CNPJ", categoria: "juridica", detalhe: null } },
  { key: "R2", requirement: { documento: "Regularidade FGTS", categoria: "fiscal", detalhe: null } },
  { key: "R3", requirement: { documento: "Balanço patrimonial", categoria: "economica", detalhe: null } },
];

describe("parseDocumentMatches", () => {
  it("maps keys back to documents and requirements", () => {
    const items = parseDocumentMatches(
      JSON.stringify({
        documentos: [
          {
            id: "D1",
            resumo: "Comprovante de inscrição no CNPJ.",
            encaixes: [{ requisito: "R1", nivel: "total", explicacao: "É o cartão CNPJ ativo." }],
            explicacao: "Atende à habilitação jurídica.",
          },
          {
            id: "d2",
            encaixes: [{ requisito: "r2", nivel: "total", explicacao: "Parece ser o CRF." }],
            explicacao: "Avaliado só pelo nome.",
          },
          { id: "D3", encaixes: [], explicacao: "Não é um documento exigido." },
        ],
      }),
      documents,
      requirements,
    );

    expect(items[0]).toMatchObject({
      documentId: "doc-cnpj",
      fit: "total",
      summary: "Comprovante de inscrição no CNPJ.",
      matches: [{ requirement: "Inscrição no CNPJ", fit: "total" }],
      note: null,
    });
    // Sem texto, nunca há encaixe total.
    expect(items[1]).toMatchObject({
      documentId: "doc-fgts",
      fit: "parcial",
      matches: [{ requirement: "Regularidade FGTS", fit: "parcial" }],
      note: "sem_texto",
    });
    expect(items[2]).toMatchObject({ documentId: "doc-foto", fit: "nenhum", matches: [] });
  });

  it("drops unknown requirements, invalid levels and duplicates", () => {
    const [item] = parseDocumentMatches(
      JSON.stringify({
        documentos: [
          {
            id: "D1",
            encaixes: [
              { requisito: "R9", nivel: "total", explicacao: "inexistente" },
              { requisito: "R1", nivel: "talvez", explicacao: "nível inválido" },
              { requisito: "R3", nivel: "parcial", explicacao: "primeiro" },
              { requisito: "R3", nivel: "total", explicacao: "repetido" },
            ],
          },
        ],
      }),
      documents.slice(0, 1),
      requirements,
    );
    expect(item.matches).toEqual([
      { requirement: "Balanço patrimonial", fit: "parcial", explanation: "primeiro" },
    ]);
    expect(item.explanation).toBe("A IA não explicou a conclusão.");
  });

  it("keeps documents the model skipped as not fitting", () => {
    const items = parseDocumentMatches('{"documentos": []}', documents, requirements);
    expect(items.map((item) => item.fit)).toEqual(["nenhum", "nenhum", "nenhum"]);
    expect(items[0].explanation).toBe("A IA não avaliou este documento.");
  });

  it("rejects answers without the document list", () => {
    expect(() => parseDocumentMatches('{"resultado": []}', documents, requirements)).toThrow();
  });
});

describe("summarizeRequirementCoverage", () => {
  it("uses the best fit per requirement", () => {
    const items = parseDocumentMatches(
      JSON.stringify({
        documentos: [
          { id: "D1", encaixes: [{ requisito: "R1", nivel: "parcial", explicacao: "a" }] },
          { id: "D3", encaixes: [{ requisito: "R1", nivel: "total", explicacao: "b" }] },
        ],
      }),
      documents,
      requirements,
    );
    expect(
      summarizeRequirementCoverage(
        requirements.map((item) => item.requirement.documento),
        items,
      ),
    ).toEqual([
      { requirement: "Inscrição no CNPJ", fit: "total" },
      { requirement: "Regularidade FGTS", fit: "nenhum" },
      { requirement: "Balanço patrimonial", fit: "nenhum" },
    ]);
    expect(sortReportDocuments(items).map((item) => item.documentId)).toEqual([
      "doc-foto",
      "doc-cnpj",
      "doc-fgts",
    ]);
  });
});

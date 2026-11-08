import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditalInsights, OpportunityEdital } from "./edital-insights";
import type { Database } from "./supabase/database.types";

const modelResponses: string[] = [];
const prompts: string[] = [];

vi.mock("@/lib/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("./llm")>();
  return {
    ...original,
    createChatModel: () => {
      const model = new FakeListChatModel({ responses: [...modelResponses] });
      const invoke = model.invoke.bind(model);
      model.invoke = async (input, options) => {
        prompts.push(JSON.stringify(input));
        return invoke(input, options);
      };
      return model;
    },
  };
});

const { computeReportSignature, generateDocumentReport, getReportRequirements } = await import(
  "./document-report-ai"
);

const edital: OpportunityEdital = {
  status: "ready",
  files: [],
  insights: {
    resumo: "Aquisição de merenda.",
    campos: {} as EditalInsights["campos"],
    requisitos: [
      { documento: "Inscrição no CNPJ", categoria: "juridica", detalhe: "Item 8.1" },
      { documento: "CNDT", categoria: "fiscal", detalhe: null },
    ],
    alertas: [],
  },
  requirements: ["Inscrição no CNPJ", "CNDT"],
  processedAt: "2026-11-01T10:00:00.000Z",
  error: null,
};

const documents = [
  {
    id: "doc-cnpj",
    name: "cnpj.pdf",
    document_type: "Cartão CNPJ",
    expires_at: null,
    storage_path: "u/cnpj.pdf",
    created_at: "2026-10-02T00:00:00.000Z",
  },
  {
    id: "doc-cndt",
    name: "cndt.pdf",
    document_type: "CNDT",
    expires_at: "2026-10-01",
    storage_path: "u/cndt.pdf",
    created_at: "2026-10-01T00:00:00.000Z",
  },
];

function fakeSupabase() {
  const stored = [
    { id: "doc-cnpj", extracted_text: "COMPROVANTE DE INSCRIÇÃO CNPJ 00.000.000/0001-00", text_extracted_at: "2026-10-02" },
  ];
  const query = {
    select: () => query,
    eq: () => query,
    in: async () => ({ data: stored, error: null }),
  };
  return { from: () => query } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  modelResponses.length = 0;
  prompts.length = 0;
});

describe("generateDocumentReport", () => {
  it("runs the chain, skips expired documents and summarizes coverage", async () => {
    modelResponses.push(
      "```json\n" +
        JSON.stringify({
          documentos: [
            {
              id: "D1",
              resumo: "Cartão CNPJ.",
              encaixes: [{ requisito: "R1", nivel: "total", explicacao: "Mostra o CNPJ ativo." }],
              explicacao: "Atende ao item 8.1.",
            },
          ],
        }) +
        "\n```",
    );

    const report = await generateDocumentReport({
      supabase: fakeSupabase(),
      userId: "user-1",
      opportunity: { title: "Merenda", organization: "Prefeitura", summary: "Merenda escolar" },
      edital,
      documents,
      today: "2026-11-08",
    });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("COMPROVANTE DE INSCRIÇÃO CNPJ");
    // O documento vencido não vai para a IA.
    expect(prompts[0]).not.toContain("cndt.pdf");
    expect(report.documents).toEqual([
      expect.objectContaining({
        documentId: "doc-cnpj",
        fit: "total",
        matches: [
          { requirement: "Inscrição no CNPJ", fit: "total", explanation: "Mostra o CNPJ ativo." },
        ],
      }),
      expect.objectContaining({ documentId: "doc-cndt", fit: "nenhum", note: "vencido" }),
    ]);
    expect(report.requirements).toEqual([
      { requirement: "Inscrição no CNPJ", fit: "total" },
      { requirement: "CNDT", fit: "nenhum" },
    ]);
  });

  it("does not call the model when every document is expired", async () => {
    const report = await generateDocumentReport({
      supabase: fakeSupabase(),
      userId: "user-1",
      opportunity: { title: "Merenda", organization: "Prefeitura", summary: "Merenda escolar" },
      edital,
      documents: documents.slice(1),
      today: "2026-11-08",
    });
    expect(prompts).toHaveLength(0);
    expect(report.documents).toHaveLength(1);
    expect(report.documents[0].note).toBe("vencido");
  });
});

describe("computeReportSignature", () => {
  it("ignores document order and changes with the edital or the documents", () => {
    const signature = computeReportSignature(edital, documents);
    expect(computeReportSignature(edital, [...documents].reverse())).toBe(signature);
    expect(
      computeReportSignature({ ...edital, processedAt: "2026-11-02T00:00:00.000Z" }, documents),
    ).not.toBe(signature);
    expect(
      computeReportSignature(edital, [{ ...documents[0], expires_at: "2027-01-01" }, documents[1]]),
    ).not.toBe(signature);
  });
});

describe("getReportRequirements", () => {
  it("keeps details from the edital and falls back for plain requirements", () => {
    expect(
      getReportRequirements({ ...edital, requirements: ["Inscrição no CNPJ", "Atestado"] }),
    ).toEqual([
      { documento: "Inscrição no CNPJ", categoria: "juridica", detalhe: "Item 8.1" },
      { documento: "Atestado", categoria: "outros", detalhe: null },
    ]);
  });
});

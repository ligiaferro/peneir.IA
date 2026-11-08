import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditalInsights, OpportunityEdital } from "./edital-insights";
import type { Database } from "./supabase/database.types";

const modelResponses: string[] = [];
const prompts: string[] = [];
const modelOptions: unknown[] = [];

vi.mock("@/lib/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("./llm")>();
  return {
    ...original,
    createChatModel: (options?: unknown) => {
      modelOptions.push(options);
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

const { applyReportLinks, computeReportSignature, generateDocumentReport, getReportRequirements } =
  await import("./document-report-ai");

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
  modelOptions.length = 0;
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

const opportunity = { title: "Merenda", organization: "Prefeitura", summary: "Merenda escolar" };

describe("generateDocumentReport (limites e falhas)", () => {
  it("splits the text budget so every document keeps its text", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      id: `doc-${index}`,
      name: `doc-${index}.pdf`,
      document_type: "Certidão",
      expires_at: null,
      storage_path: `u/doc-${index}.pdf`,
      created_at: `2026-10-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const stored = many.map((document) => ({
      id: document.id,
      extracted_text: "x".repeat(5_000),
      text_extracted_at: "2026-10-02",
    }));
    const query = { select: () => query, eq: () => query, in: async () => ({ data: stored, error: null }) };
    modelResponses.push('{"documentos": []}');

    const report = await generateDocumentReport({
      supabase: { from: () => query } as unknown as SupabaseClient<Database>,
      userId: "user-1",
      opportunity,
      edital,
      documents: many,
      today: "2026-11-08",
    });

    // Nenhum documento com texto é tratado como "sem texto" por falta de orçamento.
    expect(report.documents.filter((item) => item.note === "sem_texto")).toHaveLength(0);
    // 70.000 caracteres divididos entre 30 documentos.
    expect(prompts[0]).toContain("x".repeat(2_333));
    expect(prompts[0]).not.toContain("x".repeat(2_334));
  });

  it("calls the model without retries so failures fit in the route time limit", async () => {
    modelResponses.push('{"documentos": []}');
    await generateDocumentReport({
      supabase: fakeSupabase(),
      userId: "user-1",
      opportunity,
      edital,
      documents: documents.slice(0, 1),
      today: "2026-11-08",
    });
    expect(modelOptions).toEqual([expect.objectContaining({ maxRetries: 0 })]);
  });

  it("does not store a failed extraction as a document without text", async () => {
    const update = vi.fn();
    const query = {
      select: () => query,
      eq: () => query,
      in: async () => ({ data: [{ id: "doc-cnpj", extracted_text: null, text_extracted_at: null }], error: null }),
      update,
    };
    const supabase = {
      from: () => query,
      storage: { from: () => ({ download: async () => ({ data: null, error: { message: "timeout" } }) }) },
    } as unknown as SupabaseClient<Database>;
    vi.spyOn(console, "error").mockImplementation(() => {});
    modelResponses.push('{"documentos": []}');

    const report = await generateDocumentReport({
      supabase,
      userId: "user-1",
      opportunity,
      edital,
      documents: documents.slice(0, 1),
      today: "2026-11-08",
    });

    expect(update).not.toHaveBeenCalled();
    expect(report.documents[0].note).toBe("sem_texto");
  });
});

describe("computeReportSignature (validade)", () => {
  it("changes when a document expires after the report", () => {
    const docs = [{ id: "cndt", document_type: "CNDT", expires_at: "2026-11-05" }];
    const before = computeReportSignature(edital, docs, "2026-11-01");
    const after = computeReportSignature(edital, docs, "2026-11-10");
    expect(after).not.toBe(before);
    expect(computeReportSignature(edital, docs, "2026-11-11")).toBe(after);
  });
});

describe("applyReportLinks", () => {
  it("does not recreate links the user dismissed", async () => {
    const upserted: unknown[] = [];
    const chain = (result: unknown) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "delete"]) query[method] = () => query;
      query.then = (resolve: (value: unknown) => void) => resolve(result);
      return query;
    };
    const supabase = {
      from: (table: string) => {
        if (table === "document_link_dismissals") {
          return chain({ data: [{ document_id: "doc-a", requirement: "CNDT" }], error: null });
        }
        const query = chain({ data: [], error: null });
        query.upsert = async (rows: unknown[]) => {
          upserted.push(...rows);
          return { error: null };
        };
        return query;
      },
    } as unknown as SupabaseClient<Database>;

    await applyReportLinks(supabase, "user-1", "opp-1", {
      generatedAt: "2026-11-08T00:00:00Z",
      requirements: [],
      documents: [
        {
          documentId: "doc-a",
          name: "a.pdf",
          documentType: "CNDT",
          fit: "total",
          summary: null,
          explanation: "",
          note: null,
          matches: [
            { requirement: "CNDT", fit: "total", explanation: "rejeitado pela pessoa" },
            { requirement: "FGTS", fit: "parcial", explanation: "novo" },
          ],
        },
      ],
    });

    expect(upserted).toEqual([
      expect.objectContaining({ document_id: "doc-a", requirement: "FGTS", added_by: "ai" }),
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { DocumentReport } from "./document-report";
import type { EditalInsights } from "./edital-insights";
import { buildReportEmail, buildRequirementRows, type ReportEmailInput } from "./report-email";
import type { UserDocumentOpportunityLink } from "./types";

const insights: EditalInsights = {
  resumo: "Aquisição de merenda <escolar> para a rede municipal.",
  campos: {
    criterioJulgamento: "Menor preço por item",
    modoDisputa: null,
    dataSessao: "20/11/2026 às 9h",
    exclusivoMeEpp: "Sim",
    prazoEntrega: null,
    localEntrega: null,
    vigencia: null,
    garantia: null,
    visitaTecnica: null,
    amostra: null,
    pagamento: null,
    consorcio: null,
  },
  requisitos: [
    { documento: "Inscrição no CNPJ", categoria: "juridica", detalhe: "Item 8.1" },
    { documento: "CNDT", categoria: "fiscal", detalhe: null },
    { documento: "Balanço patrimonial", categoria: "economica", detalhe: null },
    { documento: "Atestado de capacidade técnica", categoria: "tecnica", detalhe: null },
    { documento: "Alvará sanitário", categoria: "outros", detalhe: null },
  ],
  alertas: ["Amostra obrigatória em 3 dias úteis."],
};

const requirements = insights.requisitos.map((item) => item.documento);
const opportunityId = "opp-1";

function link(
  document_id: string,
  requirement: string,
  extra: Partial<UserDocumentOpportunityLink> = {},
): UserDocumentOpportunityLink {
  return {
    user_id: "u",
    document_id,
    opportunity_id: opportunityId,
    requirement,
    created_at: "2026-11-01T00:00:00Z",
    added_by: "user",
    ai_fit: null,
    ai_explanation: null,
    ...extra,
  };
}

const documents = [
  { id: "cnpj", name: "cnpj.pdf", expires_at: null },
  { id: "cndt", name: "cndt.pdf", expires_at: "2027-01-01" },
  { id: "balanco", name: "balanco.pdf", expires_at: null },
  { id: "alvara", name: "alvara-velho.pdf", expires_at: "2026-01-01" },
];

const report: DocumentReport = {
  generatedAt: "2026-11-08T12:00:00Z",
  documents: [
    {
      documentId: "cndt",
      name: "cndt.pdf",
      documentType: "CNDT",
      fit: "total",
      summary: null,
      explanation: "Certidão válida.",
      matches: [{ requirement: "CNDT", fit: "total", explanation: "Emitida pelo TST, válida." }],
      note: null,
    },
  ],
  requirements: [],
};

const links = [
  link("cnpj", "Inscrição no CNPJ", { added_by: "ai", ai_fit: "total", ai_explanation: "Cartão CNPJ ativo." }),
  // Vinculado pela pessoa; o encaixe vem do relatório.
  link("cndt", "CNDT"),
  link("balanco", "Balanço patrimonial"),
  link("alvara", "Alvará sanitário"),
];

describe("buildRequirementRows", () => {
  it("derives each requirement status from current links and AI fits", () => {
    const rows = buildRequirementRows({
      insights,
      requirements,
      report,
      links,
      documents,
      opportunityId,
      today: "2026-11-08",
    });
    expect(rows.map((row) => [row.requirement, row.status])).toEqual([
      ["Inscrição no CNPJ", "atendido"],
      ["CNDT", "atendido"],
      ["Balanço patrimonial", "enviado"],
      ["Atestado de capacidade técnica", "pendente"],
      ["Alvará sanitário", "vencido"],
    ]);
    expect(rows[0]).toMatchObject({
      category: "Habilitação jurídica",
      detail: "Item 8.1",
      documents: [{ name: "cnpj.pdf", addedByAi: true, expired: false }],
      explanation: "Cartão CNPJ ativo.",
    });
    expect(rows[1].explanation).toBe("Emitida pelo TST, válida.");
  });
});

describe("buildReportEmail", () => {
  const input: ReportEmailInput = {
    name: "Merendas <Ltda>",
    opportunity: {
      id: opportunityId,
      title: "Pregão 12/2026 — merenda escolar",
      organization: "Prefeitura do Recife",
      location: "Recife/PE",
      deadline: "2026-11-20T12:00:00.000Z",
      sourceUrl: "https://pncp.gov.br/app/editais/1",
    },
    insights,
    requirements,
    report,
    links,
    documents,
    documentsState: "analisado",
    appUrl: "https://app.example/",
    today: "2026-11-08",
  };

  it("builds subject, counts, links and escapes user content", () => {
    const email = buildReportEmail(input);
    expect(email.subject).toBe("Relatório da vaga: Pregão 12/2026 — merenda escolar");
    expect(email.counts).toEqual({ atendido: 2, conferir: 1, pendente: 2, total: 5 });
    expect(email.html).toContain("https://app.example/oportunidade?id=opp-1");
    expect(email.html).toContain("https://app.example/conta");
    expect(email.html).toContain("Merendas &lt;Ltda&gt;");
    expect(email.html).toContain("merenda &lt;escolar&gt;");
    expect(email.html).not.toContain("<escolar>");
    expect(email.html).toContain("Menor preço por item");
    expect(email.html).toContain("Amostra obrigatória");
    expect(email.html).toContain("40% das exigências");
    expect(email.text).toContain("[Pendente] Atestado de capacidade técnica");
  });

  it("explains what is missing when documents were not analyzed", () => {
    const email = buildReportEmail({
      ...input,
      report: null,
      links: [],
      documents: [],
      documentsState: "sem_documentos",
    });
    expect(email.counts.pendente).toBe(5);
    expect(email.html).toContain("Seu arquivo ainda não tem documentos");
    expect(email.html).toContain("https://app.example/empresa#documentos");
    expect(email.html).not.toContain("Seu arquivo de documentos");
  });
});

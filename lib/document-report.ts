/**
 * Relatório "documentos da empresa × exigências do edital". Sem dependências
 * de servidor: também é usado na interface.
 */

import type { EditalRequirement } from "@/lib/edital-insights";
import { cleanModelString, parseModelJson } from "@/lib/model-json";
import type { DocumentLinkFit } from "@/lib/types";

/** Colunas de `document_opportunities`, incluindo a origem e o encaixe da IA. */
export const linkColumns =
  "user_id, document_id, opportunity_id, requirement, added_by, ai_fit, ai_explanation, created_at" as const;

export type DocumentFit = DocumentLinkFit | "nenhum";

export const documentFitLabels: Record<DocumentFit, string> = {
  total: "Encaixe total",
  parcial: "Encaixe parcial",
  nenhum: "Não se encaixa",
};

/** Por que um documento não foi lido (ou foi lido só em parte) pela IA. */
export type DocumentReportNote = "vencido" | "sem_texto" | "fora_do_limite";

export const documentReportNoteLabels: Record<DocumentReportNote, string> = {
  vencido: "Documento vencido: não foi considerado.",
  sem_texto:
    "Sem texto selecionável (PDF digitalizado?): avaliado só pelo nome e tipo, com encaixe no máximo parcial.",
  fora_do_limite: "Não coube no limite de documentos desta análise.",
};

export type DocumentReportMatch = {
  requirement: string;
  fit: DocumentLinkFit;
  explanation: string;
};

export type DocumentReportItem = {
  documentId: string;
  name: string;
  documentType: string;
  fit: DocumentFit;
  /** O que é o documento, segundo a IA. */
  summary: string | null;
  /** Por que o documento se encaixa ou não nas exigências. */
  explanation: string;
  matches: DocumentReportMatch[];
  note: DocumentReportNote | null;
};

export type RequirementCoverage = {
  requirement: string;
  fit: DocumentFit;
};

export type DocumentReport = {
  generatedAt: string;
  documents: DocumentReportItem[];
  requirements: RequirementCoverage[];
};

export type DocumentReportStatus = "processing" | "ready" | "failed";

export type OpportunityDocumentReport = {
  status: DocumentReportStatus;
  result: DocumentReport | null;
  error: string | null;
  updatedAt: string;
};

/** Documento enviado à IA, com a chave curta usada no prompt (D1, D2…). */
export type ReportInputDocument = {
  key: string;
  id: string;
  name: string;
  documentType: string;
  hasText: boolean;
};

/** Exigência enviada à IA, com a chave curta usada no prompt (R1, R2…). */
export type ReportInputRequirement = {
  key: string;
  requirement: EditalRequirement;
};

const fitRank: Record<DocumentFit, number> = { total: 2, parcial: 1, nenhum: 0 };

function bestFit(fits: DocumentFit[]): DocumentFit {
  return fits.reduce<DocumentFit>(
    (best, fit) => (fitRank[fit] > fitRank[best] ? fit : best),
    "nenhum",
  );
}

/**
 * Valida a resposta da IA e a converte para o relatório. Chaves desconhecidas
 * são descartadas; documentos que a IA não citou entram como "nenhum". Um
 * documento sem texto nunca recebe encaixe total.
 */
export function parseDocumentMatches(
  value: string,
  documents: ReportInputDocument[],
  requirements: ReportInputRequirement[],
): DocumentReportItem[] {
  const data = parseModelJson(value);
  if (!Array.isArray(data.documentos)) {
    throw new Error("A IA devolveu o relatório sem a lista de documentos.");
  }
  const requirementByKey = new Map(
    requirements.map((item) => [item.key.toUpperCase(), item.requirement.documento]),
  );
  const answers = new Map<string, Record<string, unknown>>();
  for (const item of data.documentos) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const key = typeof record.id === "string" ? record.id.trim().toUpperCase() : "";
    if (key && !answers.has(key)) answers.set(key, record);
  }

  return documents.map((document) => {
    const answer = answers.get(document.key.toUpperCase());
    const matches: DocumentReportMatch[] = [];
    const seen = new Set<string>();
    const rawMatches = Array.isArray(answer?.encaixes) ? answer.encaixes : [];
    for (const raw of rawMatches) {
      if (typeof raw !== "object" || raw === null) continue;
      const match = raw as Record<string, unknown>;
      const requirementKey =
        typeof match.requisito === "string" ? match.requisito.trim().toUpperCase() : "";
      const requirement = requirementByKey.get(requirementKey);
      if (!requirement || seen.has(requirement)) continue;
      let fit: DocumentLinkFit | null =
        match.nivel === "total" || match.nivel === "parcial" ? match.nivel : null;
      if (!fit) continue;
      if (fit === "total" && !document.hasText) fit = "parcial";
      seen.add(requirement);
      matches.push({
        requirement,
        fit,
        explanation:
          cleanModelString(match.explicacao, 800) ?? "A IA não explicou este encaixe.",
      });
    }
    matches.sort((left, right) => fitRank[right.fit] - fitRank[left.fit]);

    return {
      documentId: document.id,
      name: document.name,
      documentType: document.documentType,
      fit: bestFit(matches.map((match) => match.fit)),
      summary: cleanModelString(answer?.resumo, 400),
      explanation:
        cleanModelString(answer?.explicacao, 1200) ??
        (answer ? "A IA não explicou a conclusão." : "A IA não avaliou este documento."),
      matches,
      note: document.hasText ? null : "sem_texto",
    };
  });
}

/** Melhor encaixe obtido para cada exigência, na ordem do edital. */
export function summarizeRequirementCoverage(
  requirements: string[],
  documents: DocumentReportItem[],
): RequirementCoverage[] {
  return requirements.map((requirement) => ({
    requirement,
    fit: bestFit(
      documents.flatMap((document) =>
        document.matches
          .filter((match) => match.requirement === requirement)
          .map((match) => match.fit),
      ),
    ),
  }));
}

/** Documentos ordenados por encaixe (total, parcial, nenhum). */
export function sortReportDocuments(documents: DocumentReportItem[]) {
  return [...documents].sort((left, right) => fitRank[right.fit] - fitRank[left.fit]);
}

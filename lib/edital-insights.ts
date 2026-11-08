/**
 * Formato do que a IA extrai do edital. Sem dependências de servidor: também é
 * usado na interface.
 */

export const editalFieldLabels = {
  criterioJulgamento: "Critério de julgamento",
  modoDisputa: "Modo de disputa",
  dataSessao: "Abertura da sessão",
  exclusivoMeEpp: "Participação ME/EPP",
  prazoEntrega: "Prazo de entrega ou execução",
  localEntrega: "Local de entrega ou execução",
  vigencia: "Vigência do contrato",
  garantia: "Garantia",
  visitaTecnica: "Visita técnica",
  amostra: "Amostra ou prova de conceito",
  pagamento: "Pagamento",
  consorcio: "Consórcio",
} as const;

export type EditalFieldKey = keyof typeof editalFieldLabels;

export const editalRequirementCategories = {
  juridica: "Habilitação jurídica",
  fiscal: "Regularidade fiscal, social e trabalhista",
  economica: "Qualificação econômico-financeira",
  tecnica: "Qualificação técnica",
  proposta: "Proposta e declarações",
  outros: "Outros",
} as const;

export type EditalRequirementCategory = keyof typeof editalRequirementCategories;

export type EditalRequirement = {
  documento: string;
  categoria: EditalRequirementCategory;
  /** Detalhe ou referência ao item do edital, quando houver. */
  detalhe: string | null;
};

export type EditalInsights = {
  resumo: string;
  campos: Record<EditalFieldKey, string | null>;
  requisitos: EditalRequirement[];
  alertas: string[];
};

export type EditalFileStatus = "lido" | "sem_texto" | "nao_suportado" | "muito_grande" | "erro";

export type EditalFile = {
  titulo: string;
  tipo: string;
  nome: string;
  url: string;
  status: EditalFileStatus;
  paginas?: number;
};

export type EditalStatus = "processing" | "ready" | "no_files" | "no_text" | "failed";

export type OpportunityEdital = {
  status: EditalStatus;
  files: EditalFile[];
  insights: EditalInsights | null;
  requirements: string[];
  processedAt: string | null;
  error: string | null;
};

const maxRequirements = 40;
const maxRequirementLength = 200;
const maxTextLength = 600;

function cleanString(value: unknown, maxLength = maxTextLength) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

/** Remove cercas de Markdown que alguns modelos adicionam em volta do JSON. */
function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

/**
 * Valida e normaliza a resposta da IA. Campos ausentes viram null; requisitos
 * repetidos ou vazios são descartados. Lança erro se a estrutura básica faltar.
 */
export function parseEditalInsights(value: string): EditalInsights {
  const parsed: unknown = JSON.parse(stripCodeFence(value));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("A IA devolveu um JSON inválido para o edital.");
  }
  const data = parsed as Record<string, unknown>;
  const resumo = cleanString(data.resumo, 1500);
  if (!resumo || !Array.isArray(data.requisitos)) {
    throw new Error("A IA devolveu o edital sem resumo ou sem a lista de requisitos.");
  }

  const rawFields =
    typeof data.campos === "object" && data.campos !== null
      ? (data.campos as Record<string, unknown>)
      : {};
  const campos = Object.fromEntries(
    (Object.keys(editalFieldLabels) as EditalFieldKey[]).map((key) => [
      key,
      cleanString(rawFields[key]),
    ]),
  ) as Record<EditalFieldKey, string | null>;

  const seen = new Set<string>();
  const requisitos: EditalRequirement[] = [];
  for (const item of data.requisitos) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const documento = cleanString(record.documento, maxRequirementLength);
    if (!documento) continue;
    const key = documento.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    const categoria =
      typeof record.categoria === "string" &&
      Object.hasOwn(editalRequirementCategories, record.categoria)
        ? (record.categoria as EditalRequirementCategory)
        : "outros";
    requisitos.push({ documento, categoria, detalhe: cleanString(record.detalhe) });
    if (requisitos.length >= maxRequirements) break;
  }

  const alertas = Array.isArray(data.alertas)
    ? data.alertas
        .map((alerta) => cleanString(alerta))
        .filter((alerta): alerta is string => alerta !== null)
        .slice(0, 10)
    : [];

  return { resumo, campos, requisitos, alertas };
}

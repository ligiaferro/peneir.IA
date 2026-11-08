import type { OpportunityCategory } from "@/lib/types";

const categorySuggestions: Record<OpportunityCategory, string[]> = {
  licitacoes: [
    "Comprovante de inscrição no CNPJ",
    "Certidões de regularidade fiscal e trabalhista",
    "Atestado de capacidade técnica",
    "Proposta comercial",
  ],
};

const keywordSuggestions: Array<{ keywords: string[]; documents: string[] }> = [
  {
    keywords: ["engenharia", "arquitetura", "obra", "manutenção"],
    documents: ["Registro profissional no CREA ou CAU"],
  },
  {
    keywords: ["saúde", "medicina", "enfermagem", "odontologia"],
    documents: ["Registro no conselho profissional da área"],
  },
];

export function getDocumentSuggestions(
  categories: OpportunityCategory[],
  keywords: string[],
): string[] {
  const suggestions = categories.flatMap(
    (category) => categorySuggestions[category],
  );
  const normalizedKeywords = keywords.map((keyword) =>
    keyword.trim().toLocaleLowerCase("pt-BR"),
  );

  for (const rule of keywordSuggestions) {
    if (
      rule.keywords.some((term) =>
        normalizedKeywords.some((keyword) => keyword.includes(term)),
      )
    ) {
      suggestions.push(...rule.documents);
    }
  }

  return [...new Set(suggestions)];
}

/**
 * Tipos comuns de documentos de habilitação, sugeridos ao enviar documentos ao
 * arquivo da empresa. O campo aceita qualquer outro texto.
 */
export const companyDocumentTypes = [
  "Cartão CNPJ (comprovante de inscrição)",
  "Contrato social ou estatuto e alterações",
  "Documento de identidade do representante legal",
  "Procuração",
  "Certidão conjunta de débitos federais e dívida ativa da União",
  "Certificado de regularidade do FGTS (CRF)",
  "Certidão negativa de débitos trabalhistas (CNDT)",
  "Certidão de regularidade fiscal estadual",
  "Certidão de regularidade fiscal municipal",
  "Inscrição estadual ou municipal",
  "Certidão negativa de falência e recuperação judicial",
  "Balanço patrimonial e demonstrações contábeis",
  "Atestado de capacidade técnica",
  "Registro no conselho profissional (CREA, CAU, CRA etc.)",
  "Alvará de funcionamento ou licença sanitária",
  "Declaração ME/EPP",
];

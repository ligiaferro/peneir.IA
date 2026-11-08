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

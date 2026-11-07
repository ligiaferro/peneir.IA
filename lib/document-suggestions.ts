import type { OpportunityCategory } from "@/lib/types";

const categorySuggestions: Record<OpportunityCategory, string[]> = {
  licitacoes: [
    "Comprovante de inscrição no CNPJ",
    "Certidões de regularidade fiscal e trabalhista",
    "Atestado de capacidade técnica",
    "Proposta comercial",
  ],
  concursos: [
    "Documento de identidade e CPF",
    "Diploma ou certificado de escolaridade",
    "Currículo",
    "Comprovante de inscrição",
  ],
  doutorado: [
    "Diploma e histórico acadêmico",
    "Projeto de pesquisa",
    "Currículo Lattes",
    "Carta de intenção",
  ],
  bolsas: [
    "Currículo Lattes ou acadêmico",
    "Plano de trabalho ou projeto",
    "Comprovante de vínculo institucional",
    "Comprovantes de titulação",
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
  {
    keywords: ["professor", "docência", "educação", "ensino"],
    documents: ["Comprovantes de titulação e experiência docente"],
  },
  {
    keywords: ["pesquisa", "pesquisador", "científica", "científico"],
    documents: ["Projeto ou plano de pesquisa"],
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

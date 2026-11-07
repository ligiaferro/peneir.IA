import type {
  Opportunity,
  OpportunityCategory,
  UserProfile,
} from "@/lib/types";
import { opportunityCategories } from "@/lib/types";

const relativeDate = (daysAgo: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
};

export const mockOpportunities: Opportunity[] = [
  {
    id: "mock-pncp-001",
    title: "Aquisição de materiais de informática",
    organization: "Prefeitura Municipal de Recife",
    category: "licitacoes",
    location: "Recife, PE",
    summary:
      "Compra pública de notebooks e periféricos para unidades administrativas. Participação aberta a micro e pequenas empresas.",
    tags: ["informática", "fornecimento", "microempresa", "notebooks"],
    requirements: [
      "Comprovante de inscrição no CNPJ",
      "Certidão de regularidade fiscal válida",
      "Atestado de capacidade técnica",
      "Proposta comercial",
    ],
    deadline: "2026-12-03",
    publishedAt: relativeDate(0),
    sourceUrl: "https://pncp.gov.br/",
  },
  {
    id: "mock-pncp-002",
    title: "Serviços de manutenção predial",
    organization: "Universidade Federal de Pernambuco",
    category: "licitacoes",
    location: "Recife, PE",
    summary:
      "Contratação de empresa para serviços de manutenção preventiva e corretiva em prédios do campus.",
    tags: ["engenharia", "serviços", "manutenção", "atestado técnico"],
    requirements: [
      "Registro da empresa no conselho profissional",
      "Certidões fiscais e trabalhistas",
      "Atestado de execução de serviço semelhante",
    ],
    deadline: "2026-12-12",
    publishedAt: relativeDate(2),
    sourceUrl: "https://pncp.gov.br/",
  },
  {
    id: "mock-concurso-001",
    title: "Concurso público para Analista Administrativo",
    organization: "Secretaria de Administração de Pernambuco",
    category: "concursos",
    location: "Pernambuco",
    summary:
      "Seleção para cargos de nível superior com prova objetiva e avaliação de títulos.",
    tags: ["administração", "nível superior", "concurso", "diploma"],
    requirements: [
      "Documento de identidade e CPF",
      "Diploma de graduação reconhecido",
      "Comprovante de pagamento da inscrição",
    ],
    deadline: "2026-11-28",
    publishedAt: relativeDate(0),
    sourceUrl: "https://www.gov.br/",
  },
  {
    id: "mock-concurso-002",
    title: "Seleção para Professor de História",
    organization: "Instituto Federal do Sertão Pernambucano",
    category: "concursos",
    location: "Petrolina, PE",
    summary:
      "Processo seletivo para professor substituto com avaliação de títulos e prova didática.",
    tags: ["história", "docência", "mestrado", "concurso"],
    requirements: [
      "Diploma de graduação em História",
      "Currículo documentado",
      "Documentos comprobatórios de titulação",
    ],
    deadline: "2026-12-08",
    publishedAt: relativeDate(1),
    sourceUrl: "https://www.gov.br/",
  },
  {
    id: "mock-phd-001",
    title: "Doutorado em Ciências da Computação",
    organization: "Universidade Federal de Pernambuco",
    category: "doutorado",
    location: "Recife, PE",
    summary:
      "Seleção de novos doutorandos em inteligência artificial, sistemas e engenharia de software.",
    tags: ["computação", "inteligência artificial", "doutorado", "pesquisa"],
    requirements: [
      "Diploma de mestrado ou declaração de conclusão",
      "Histórico acadêmico",
      "Projeto de pesquisa",
      "Currículo Lattes atualizado",
    ],
    deadline: "2026-12-15",
    publishedAt: relativeDate(0),
    sourceUrl: "https://www.gov.br/capes/",
  },
  {
    id: "mock-phd-002",
    title: "Doutorado em Saúde Coletiva",
    organization: "Fundação Oswaldo Cruz",
    category: "doutorado",
    location: "Recife, PE",
    summary:
      "Programa de pós-graduação com linhas de pesquisa em políticas de saúde e epidemiologia.",
    tags: ["saúde", "epidemiologia", "doutorado", "pesquisa"],
    requirements: [
      "Diploma de mestrado",
      "Carta de intenção",
      "Projeto de pesquisa",
      "Comprovação de proficiência em idioma",
    ],
    deadline: "2026-12-18",
    publishedAt: relativeDate(4),
    sourceUrl: "https://www.gov.br/capes/",
  },
  {
    id: "mock-bolsa-001",
    title: "Bolsa de pesquisa em sustentabilidade",
    organization: "Fundação de Amparo à Ciência e Tecnologia de Pernambuco",
    category: "bolsas",
    location: "Pernambuco",
    summary:
      "Apoio a pesquisadoras e pesquisadores em projetos de inovação e desenvolvimento sustentável.",
    tags: ["pesquisa", "sustentabilidade", "bolsa", "inovação"],
    requirements: [
      "Currículo acadêmico",
      "Plano de trabalho",
      "Comprovante de vínculo com instituição de pesquisa",
    ],
    deadline: "2026-12-10",
    publishedAt: relativeDate(0),
    sourceUrl: "https://www.gov.br/capes/",
  },
];

export const categoryLabels: Record<OpportunityCategory, string> = {
  licitacoes: "Licitações",
  concursos: "Concursos",
  doutorado: "Doutorado",
  bolsas: "Bolsas e pesquisa",
};

export function getMatchingOpportunities(
  profile: Pick<UserProfile, "categories" | "keywords">,
  opportunities: Opportunity[] = mockOpportunities,
): Opportunity[] {
  const normalizedKeywords = profile.keywords
    .map((keyword) => keyword.trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean);

  return opportunities.filter((opportunity) => {
    const categoryMatches = profile.categories.includes(opportunity.category);
    if (!categoryMatches) return false;
    if (normalizedKeywords.length === 0) return true;

    const searchableText = [
      opportunity.title,
      opportunity.organization,
      opportunity.location,
      opportunity.summary,
      ...opportunity.tags,
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");

    return normalizedKeywords.some((keyword) =>
      searchableText.includes(keyword),
    );
  });
}

export function isOpportunityCategory(
  value: string,
): value is OpportunityCategory {
  return (opportunityCategories as readonly string[]).includes(value);
}

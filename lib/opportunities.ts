import type {
  Opportunity,
  OpportunityCategory,
  UserProfile,
} from "@/lib/types";
import { opportunityCategories } from "@/lib/types";

const dayInMs = 24 * 60 * 60 * 1000;

type DemoOpportunitySeed = Omit<
  Opportunity,
  "source" | "deadline" | "publishedAt" | "firstSeenAt" | "requirementsAreGeneric"
> & { publishedDaysAgo: number; deadlineInDays: number };

// Categorias ainda sem fonte real conectada. Licitações vêm do PNCP.
// As datas são relativas ao momento da consulta para que a demonstração não expire.
const demoOpportunitySeeds: DemoOpportunitySeed[] = [
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
    publishedDaysAgo: 0,
    deadlineInDays: 21,
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
    publishedDaysAgo: 1,
    deadlineInDays: 30,
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
    publishedDaysAgo: 0,
    deadlineInDays: 38,
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
    publishedDaysAgo: 4,
    deadlineInDays: 41,
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
    publishedDaysAgo: 0,
    deadlineInDays: 33,
    sourceUrl: "https://www.gov.br/capes/",
  },
];

export function getDemoOpportunities(now = new Date()): Opportunity[] {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  return demoOpportunitySeeds.map(
    ({ publishedDaysAgo, deadlineInDays, ...seed }) => {
      const publishedAt = new Date(
        startOfDay.getTime() - publishedDaysAgo * dayInMs,
      ).toISOString();
      return {
        ...seed,
        source: "demo",
        requirementsAreGeneric: false,
        publishedAt,
        firstSeenAt: publishedAt,
        // 23:59 no horário de Brasília (UTC-3).
        deadline: new Date(
          startOfDay.getTime() + deadlineInDays * dayInMs + (26 * 60 + 59) * 60 * 1000,
        ).toISOString(),
      };
    },
  );
}

export function isDemoOpportunityId(id: string) {
  return id.startsWith("mock-");
}

export const categoryLabels: Record<OpportunityCategory, string> = {
  licitacoes: "Licitações",
  concursos: "Concursos",
  doutorado: "Doutorado",
  bolsas: "Bolsas e pesquisa",
};

/** Minúsculas e sem acentos, para comparar "INFORMATICA" com "informática". */
export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/**
 * Categorias a consultar para um perfil. Sem categoria marcada, a busca é feita
 * só por palavras-chave, em todas as categorias.
 */
export function getSearchCategories(
  profile: Pick<UserProfile, "categories">,
): readonly OpportunityCategory[] {
  return profile.categories.length > 0 ? profile.categories : opportunityCategories;
}

export function getMatchingOpportunities(
  profile: Pick<UserProfile, "categories" | "keywords">,
  opportunities: Opportunity[],
): Opportunity[] {
  const normalizedKeywords = profile.keywords
    .map(normalizeSearchText)
    .filter(Boolean);
  // Perfil sem categoria nem palavra-chave não tem critério de busca.
  if (profile.categories.length === 0 && normalizedKeywords.length === 0) {
    return [];
  }
  const categories = getSearchCategories(profile);

  return opportunities.filter((opportunity) => {
    if (!categories.includes(opportunity.category)) return false;
    if (normalizedKeywords.length === 0) return true;

    const searchableText = normalizeSearchText(
      [
        opportunity.title,
        opportunity.organization,
        opportunity.location,
        opportunity.summary,
        ...opportunity.tags,
      ].join(" "),
    );

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

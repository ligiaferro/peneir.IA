import type {
  Opportunity,
  OpportunityCategory,
  UserProfile,
} from "@/lib/types";
import { opportunityCategories } from "@/lib/types";

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

/**
 * true quando a oportunidade está em um dos estados de atuação. Sem estados
 * escolhidos, vale o Brasil todo; oportunidades sem UF (abrangência nacional)
 * aparecem para todos.
 */
export function matchesStates(
  opportunity: Pick<Opportunity, "uf">,
  states: readonly string[],
) {
  return states.length === 0 || !opportunity.uf || states.includes(opportunity.uf);
}

export function getMatchingOpportunities(
  profile: Pick<UserProfile, "categories" | "keywords"> &
    Partial<Pick<UserProfile, "states">>,
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
  const states = profile.states ?? [];

  return opportunities.filter((opportunity) => {
    if (!categories.includes(opportunity.category)) return false;
    if (!matchesStates(opportunity, states)) return false;
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

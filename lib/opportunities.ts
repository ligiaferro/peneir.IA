import type { OpportunityCategory, UserProfile } from "@/lib/types";
import { opportunityCategories } from "@/lib/types";

export const categoryLabels: Record<OpportunityCategory, string> = {
  licitacoes: "Licitações",
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
  // Ignora categorias que deixaram de existir em perfis antigos.
  const valid = profile.categories.filter(isOpportunityCategory);
  return valid.length > 0 ? valid : opportunityCategories;
}

export function isOpportunityCategory(
  value: string,
): value is OpportunityCategory {
  return (opportunityCategories as readonly string[]).includes(value);
}

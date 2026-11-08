import { normalizeSearchText } from "@/lib/opportunities";
import type { UserDocument } from "@/lib/types";

const ignoredTerms = new Set(
  "a as o os um uma uns umas de da do das dos e em para por com sem no na nos nas ou conforme pelo pela pelos pelas documento documentos arquivo arquivos pdf".split(
    " ",
  ),
);
const minimumScore = 0.25;

export type DocumentSuggestion<
  TDocument extends SuggestibleDocument = SuggestibleDocument,
> = {
  document: TDocument;
  score: number;
  matchingTerms: string[];
};

export type SuggestibleDocument = Pick<
  UserDocument,
  "id" | "document_type" | "name" | "expires_at" | "created_at"
>;

function getTerms(value: string) {
  return new Set(
    normalizeSearchText(value)
      .split(/[^a-z0-9]+/)
      .map((term) => {
        if (term.endsWith("oes") && term.length > 5) {
          return `${term.slice(0, -3)}ao`;
        }
        if (term.endsWith("ais") && term.length > 5) {
          return `${term.slice(0, -3)}al`;
        }
        if (term.endsWith("s") && term.length > 4) {
          return term.slice(0, -1);
        }
        return term;
      })
      .filter((term) => term.length > 2 && !ignoredTerms.has(term)),
  );
}

function compareTerms(requirementTerms: Set<string>, documentTerms: Set<string>) {
  const matchingTerms = [...requirementTerms].filter((term) =>
    documentTerms.has(term),
  );
  const score =
    matchingTerms.length === 0
      ? 0
      : matchingTerms.length / Math.sqrt(requirementTerms.size * documentTerms.size);
  return { score, matchingTerms };
}

export function suggestDocumentsForRequirement<
  TDocument extends SuggestibleDocument,
>(
  requirement: string,
  documents: TDocument[],
  today = new Date().toISOString().slice(0, 10),
): DocumentSuggestion<TDocument>[] {
  const requirementTerms = getTerms(requirement);
  if (requirementTerms.size === 0) return [];

  return documents
    .filter((document) => !document.expires_at || document.expires_at >= today)
    .map((document) => {
      const typeTerms = getTerms(document.document_type);
      const nameTerms = getTerms(document.name);
      const byType = compareTerms(requirementTerms, typeTerms);
      const byName = compareTerms(requirementTerms, nameTerms);
      const bestMatch = byType.score >= byName.score ? byType : byName;
      const bestMatchTerms = bestMatch === byType ? typeTerms : nameTerms;
      const hasSpecificSingleTerm =
        bestMatch.matchingTerms.length === 1 &&
        bestMatch.matchingTerms[0].length >= 5 &&
        (requirementTerms.size === 1 || bestMatchTerms.size === 1);

      if (
        bestMatch.score < minimumScore ||
        (bestMatch.matchingTerms.length < 2 && !hasSpecificSingleTerm)
      ) {
        return null;
      }

      return {
        document,
        score: bestMatch.score,
        matchingTerms: bestMatch.matchingTerms,
      };
    })
    .filter(
      (suggestion): suggestion is DocumentSuggestion<TDocument> =>
        suggestion !== null,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.document.created_at.localeCompare(left.document.created_at),
    );
}

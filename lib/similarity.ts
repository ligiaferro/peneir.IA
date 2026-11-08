export function similarityToPercentage(similarity: number) {
  if (!Number.isFinite(similarity)) return 0;
  return Math.round(Math.max(0, Math.min(1, similarity)) * 100);
}

export function isGreatMatchScore(similarity: number) {
  return Number.isFinite(similarity) && similarity > 0.8;
}

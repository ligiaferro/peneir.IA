const defaultMinimumSimilarityPercent = 50;

function getMinimumSimilarityPercent() {
  const configured = process.env.EDITAL_AUTO_READ_MIN_SIMILARITY_PERCENT;
  if (configured === undefined || configured.trim() === "") {
    return defaultMinimumSimilarityPercent;
  }

  const percentage = Number(configured);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error(
      "EDITAL_AUTO_READ_MIN_SIMILARITY_PERCENT deve ser um número entre 0 e 100.",
    );
  }
  return percentage;
}

export function shouldAutomaticallyReadEdital(similarity: number) {
  return (
    Number.isFinite(similarity) &&
    similarity * 100 > getMinimumSimilarityPercent()
  );
}

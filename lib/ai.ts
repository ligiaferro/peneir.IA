import OpenAI from "openai";

export const defaultEmbeddingModel = "text-embedding-3-small";
export const embeddingDimensions = 1536;
export const minimumOpportunitySimilarity = 0.4;

export function isAboveSemanticMatchThreshold(similarity: number) {
  return Number.isFinite(similarity) && similarity >= minimumOpportunitySimilarity;
}

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}

export function getEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || defaultEmbeddingModel;
}

export async function createEmbeddings(texts: string[]) {
  if (texts.length === 0) return [];
  const model = getEmbeddingModel();
  const response = await getOpenAIClient().embeddings.create({
    model,
    input: texts,
    dimensions: embeddingDimensions,
  });
  if (response.data.length !== texts.length) {
    throw new Error(
      `The embeddings endpoint returned ${response.data.length} vectors for ${texts.length} inputs.`,
    );
  }

  const orderedData = [...response.data].sort((left, right) => left.index - right.index);
  if (orderedData.some(({ index }, position) => index !== position)) {
    throw new Error("The embeddings endpoint returned duplicate or missing vector indexes.");
  }
  const vectors = orderedData
    .map(({ embedding }) => embedding);
  if (
    vectors.some(
      (vector) =>
        vector.length !== embeddingDimensions ||
        vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error(
      `The embeddings endpoint must return finite ${embeddingDimensions}-dimension vectors.`,
    );
  }
  return vectors;
}

export function vectorToPostgres(vector: number[]) {
  if (
    vector.length !== embeddingDimensions ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`Expected a finite ${embeddingDimensions}-dimension vector.`);
  }
  return `[${vector.join(",")}]`;
}

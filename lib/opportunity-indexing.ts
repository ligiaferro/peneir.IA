import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmbeddings,
  getEmbeddingModel,
  vectorToPostgres,
} from "@/lib/ai";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type OpportunityIndexRow = Pick<
  Database["public"]["Tables"]["opportunities"]["Row"],
  "id" | "title" | "summary" | "tags"
>;

const embeddingBatchSize = 50;
const writeConcurrency = 10;
const opportunityEmbeddingInputVersion = 2;

export function buildProfileEmbeddingText(
  productsServices: string,
  keywords: string[],
) {
  return [
    productsServices.trim(),
    keywords.map((keyword) => keyword.trim()).filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOpportunityEmbeddingText(
  opportunity: Pick<OpportunityIndexRow, "title" | "summary" | "tags">,
) {
  return [
    opportunity.title,
    opportunity.summary,
    opportunity.tags.join(", "),
  ]
    .filter(Boolean)
    .join("\n");
}

async function updateIndexes(
  supabase: Client,
  updates: Array<{
    id: string;
    status: "indexed" | "failed";
    embedding?: string;
    error?: string | null;
  }>,
) {
  for (let start = 0; start < updates.length; start += writeConcurrency) {
    const batch = updates.slice(start, start + writeConcurrency);
    const results = await Promise.all(
      batch.map(({ id, status, embedding, error }) => {
        const values: Database["public"]["Tables"]["opportunities"]["Update"] = {
          index_status: status,
          index_error: error ?? null,
          ...(status === "indexed"
            ? {
                embedding,
                embedding_model: getEmbeddingModel(),
                embedding_input_version: opportunityEmbeddingInputVersion,
                commercial_concepts: [],
                indexed_at: new Date().toISOString(),
              }
            : {}),
        };
        return supabase.from("opportunities").update(values).eq("id", id);
      }),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Embeds source fields directly; rows previously marked irrelevant by the
 * former classifier are included so they can be recovered without that call.
 */
export async function indexPendingOpportunities(
  supabase: Client,
  options: { ids?: string[]; limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 100));
  let pendingQuery = supabase
    .from("opportunities")
    .select("id, title, summary, tags")
    .in("index_status", ["pending", "failed", "irrelevant"])
    .is("closed_at", null)
    .gt("deadline", new Date().toISOString())
    .order("published_at", { ascending: true })
    .limit(limit);
  let staleModelQuery = supabase
    .from("opportunities")
    .select("id, title, summary, tags")
    .eq("index_status", "indexed")
    .neq("embedding_model", getEmbeddingModel())
    .is("closed_at", null)
    .gt("deadline", new Date().toISOString())
    .order("published_at", { ascending: true })
    .limit(limit);
  let staleInputQuery = supabase
    .from("opportunities")
    .select("id, title, summary, tags")
    .eq("index_status", "indexed")
    .lt("embedding_input_version", opportunityEmbeddingInputVersion)
    .is("closed_at", null)
    .gt("deadline", new Date().toISOString())
    .order("published_at", { ascending: true })
    .limit(limit);
  if (options.ids) {
    if (options.ids.length === 0) {
      return { selected: 0, indexed: 0, failed: 0 };
    }
    pendingQuery = pendingQuery.in("id", options.ids);
    staleModelQuery = staleModelQuery.in("id", options.ids);
    staleInputQuery = staleInputQuery.in("id", options.ids);
  }
  const [pendingResult, staleModelResult, staleInputResult] = await Promise.all([
    pendingQuery,
    staleModelQuery,
    staleInputQuery,
  ]);
  if (pendingResult.error) throw pendingResult.error;
  if (staleModelResult.error) throw staleModelResult.error;
  if (staleInputResult.error) throw staleInputResult.error;
  const includedIds = new Set(pendingResult.data.map(({ id }) => id));
  const staleModelIds = new Set(staleModelResult.data.map(({ id }) => id));
  const staleData = [
    ...staleModelResult.data,
    ...staleInputResult.data.filter(
      ({ id }) => !includedIds.has(id) && !staleModelIds.has(id),
    ),
  ];
  const data = [
    ...pendingResult.data,
    ...staleData.filter(({ id }) => !includedIds.has(id)),
  ].slice(0, limit) as OpportunityIndexRow[];

  let indexed = 0;
  let failed = 0;
  for (let start = 0; start < data.length; start += embeddingBatchSize) {
    const batch = data.slice(start, start + embeddingBatchSize);
    try {
      const vectors = await createEmbeddings(
        batch.map(buildOpportunityEmbeddingText),
      );
      await updateIndexes(
        supabase,
        batch.map(({ id }, index) => ({
          id,
          status: "indexed" as const,
          embedding: vectorToPostgres(vectors[index]),
        })),
      );
      indexed += batch.length;
    } catch (embeddingError) {
      const reason = errorMessage(embeddingError);
      await updateIndexes(
        supabase,
        batch.map(({ id }) => ({
          id,
          status: "failed" as const,
          error: reason.slice(0, 1000),
        })),
      );
      failed += batch.length;
      console.error("Could not embed PNCP opportunities.", {
        count: batch.length,
        error: reason,
      });
    }
  }

  return { selected: data.length, indexed, failed };
}

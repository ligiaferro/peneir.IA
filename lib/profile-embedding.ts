import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmbeddings, getEmbeddingModel, vectorToPostgres } from "@/lib/ai";
import { buildProfileEmbeddingText } from "@/lib/opportunity-indexing";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type EmbeddableProfile = {
  id: string;
  products_services: string;
  keywords: string[];
  embedding_model: string | null;
};

/**
 * O vetor do perfil foi gerado com outro modelo de embeddings. A busca só
 * compara vetores do mesmo modelo, então esse perfil deixaria de encontrar
 * oportunidades até ser revetorizado.
 */
export function hasStaleProfileEmbedding(
  profile: Pick<EmbeddableProfile, "embedding_model">,
  currentModel = getEmbeddingModel(),
) {
  return profile.embedding_model !== null && profile.embedding_model !== currentModel;
}

/**
 * Revetoriza, em lotes, os perfis cujo vetor é de um modelo antigo. Devolve os
 * ids atualizados; falhas são registradas e não interrompem o restante.
 */
export async function refreshStaleProfileEmbeddings(
  supabase: Client,
  profiles: EmbeddableProfile[],
) {
  const model = getEmbeddingModel();
  const stale = profiles.filter(
    (profile) =>
      hasStaleProfileEmbedding(profile, model) &&
      buildProfileEmbeddingText(profile.products_services, profile.keywords),
  );
  const refreshed: string[] = [];

  for (let start = 0; start < stale.length; start += 50) {
    const batch = stale.slice(start, start + 50);
    try {
      const vectors = await createEmbeddings(
        batch.map((profile) =>
          buildProfileEmbeddingText(profile.products_services, profile.keywords),
        ),
      );
      const updatedAt = new Date().toISOString();
      for (const [index, profile] of batch.entries()) {
        const { error } = await supabase
          .from("profiles")
          .update({
            embedding: vectorToPostgres(vectors[index]),
            embedding_model: model,
            embedding_updated_at: updatedAt,
          })
          .eq("id", profile.id);
        if (error) throw error;
        refreshed.push(profile.id);
      }
    } catch (error) {
      console.error("Could not refresh stale profile embeddings.", {
        count: batch.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return refreshed;
}

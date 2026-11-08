import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EditalFile,
  EditalInsights,
  EditalStatus,
  OpportunityEdital,
} from "@/lib/edital-insights";
import type { Database } from "@/lib/supabase/database.types";
import type { Opportunity } from "@/lib/types";

type Client = SupabaseClient<Database>;

export async function getOpportunityEdital(
  supabase: Client,
  opportunityId: string,
): Promise<OpportunityEdital | null> {
  const { data, error } = await supabase
    .from("opportunity_editais")
    .select("status, files, insights, requirements, processed_at, error")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    status: data.status as EditalStatus,
    files: (data.files ?? []) as EditalFile[],
    insights: (data.insights ?? null) as EditalInsights | null,
    requirements: data.requirements ?? [],
    processedAt: data.processed_at,
    error: data.error,
  };
}

/**
 * Usa os documentos extraídos do edital no lugar da lista genérica, quando a
 * leitura terminou e encontrou requisitos.
 */
export function withEditalRequirements(
  opportunity: Opportunity,
  edital: OpportunityEdital | null,
): Opportunity {
  if (edital?.status !== "ready" || edital.requirements.length === 0) return opportunity;
  return {
    ...opportunity,
    requirements: edital.requirements,
    requirementsAreGeneric: false,
  };
}

/**
 * Requisitos aceitos para vincular documentos: os gravados na oportunidade
 * (lista genérica) e os extraídos do edital. Mantém os genéricos para que
 * vínculos feitos antes da leitura continuem válidos.
 */
export async function getAcceptedRequirements(
  supabase: Client,
  opportunityId: string,
  storedRequirements: string[],
) {
  // Sem a migração do edital, vale só a lista gravada.
  const edital = await getOpportunityEdital(supabase, opportunityId).catch(() => null);
  return edital?.status === "ready"
    ? [...new Set([...storedRequirements, ...edital.requirements])]
    : storedRequirements;
}

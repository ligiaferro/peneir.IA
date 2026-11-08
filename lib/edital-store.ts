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
 * Há requisitos lidos do edital. Durante uma releitura (status "processing"),
 * continuam valendo os da leitura anterior.
 */
function hasUsableRequirements(
  edital: OpportunityEdital | null,
): edital is OpportunityEdital {
  return (
    edital !== null &&
    (edital.status === "ready" || edital.status === "processing") &&
    edital.requirements.length > 0
  );
}

/**
 * Usa os documentos extraídos do edital no lugar da lista genérica, quando a
 * leitura terminou e encontrou requisitos.
 */
export function withEditalRequirements(
  opportunity: Opportunity,
  edital: OpportunityEdital | null,
): Opportunity {
  if (!hasUsableRequirements(edital)) return opportunity;
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
  return hasUsableRequirements(edital)
    ? [...new Set([...storedRequirements, ...edital.requirements])]
    : storedRequirements;
}

/** Leituras de edital de várias oportunidades (ex.: os cards de uma página). */
export async function getOpportunityEditais(supabase: Client, opportunityIds: string[]) {
  const editais = new Map<string, OpportunityEdital>();
  if (opportunityIds.length === 0) return editais;
  const { data, error } = await supabase
    .from("opportunity_editais")
    .select("opportunity_id, status, files, insights, requirements, processed_at, error")
    .in("opportunity_id", opportunityIds);
  if (error) throw error;
  for (const row of data) {
    editais.set(row.opportunity_id, {
      status: row.status as EditalStatus,
      files: (row.files ?? []) as EditalFile[],
      insights: (row.insights ?? null) as EditalInsights | null,
      requirements: row.requirements ?? [],
      processedAt: row.processed_at,
      error: row.error,
    });
  }
  return editais;
}

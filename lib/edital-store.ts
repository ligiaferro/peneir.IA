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
    .select("status, files, insights, requirements, processed_at, updated_at, error")
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
    updatedAt: data.updated_at,
    error: data.error,
  };
}

/** Há requisitos extraídos disponíveis, inclusive durante uma releitura. */
function hasUsableRequirements(
  edital: OpportunityEdital | null,
): edital is OpportunityEdital {
  return (
    edital !== null &&
    (edital.status === "ready" || edital.status === "processing") &&
    edital.requirements.length > 0
  );
}

/** Usa os requisitos extraídos, inclusive uma lista vazia após leitura concluída. */
export function withEditalRequirements(
  opportunity: Opportunity,
  edital: OpportunityEdital | null,
): Opportunity {
  if (!edital || (edital.status !== "ready" && !hasUsableRequirements(edital))) {
    return opportunity;
  }
  return {
    ...opportunity,
    requirements: edital.requirements,
    requirementsAreGeneric: false,
  };
}

/**
 * Requisitos aceitos para vincular documentos: os gravados na oportunidade e
 * os extraídos do edital. Mantém vínculos existentes após a leitura.
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
    .select("opportunity_id, status, files, insights, requirements, processed_at, updated_at, error")
    .in("opportunity_id", opportunityIds);
  if (error) throw error;
  for (const row of data) {
    editais.set(row.opportunity_id, {
      status: row.status as EditalStatus,
      files: (row.files ?? []) as EditalFile[],
      insights: (row.insights ?? null) as EditalInsights | null,
      requirements: row.requirements ?? [],
      processedAt: row.processed_at,
      updatedAt: row.updated_at,
      error: row.error,
    });
  }
  return editais;
}

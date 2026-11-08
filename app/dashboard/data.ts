import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { getConfiguredStates } from "@/lib/config";
import { readEditaisInBackground } from "@/lib/edital-queue";
import type { SuggestibleDocument } from "@/lib/document-matching";
import { getStaleStates, refreshLiveOpportunities } from "@/lib/live-refresh";
import { isOpportunityCategory } from "@/lib/opportunities";
import { fetchAllPages } from "@/lib/paginate";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Opportunity, UserKind, UserProfile } from "@/lib/types";

type Client = SupabaseClient<Database>;

function errorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "erro desconhecido";
}

/** Perfil de quem está logado, com os tipos do app. */
export async function loadDashboardProfile(supabase: Client, userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, user_kind, categories, keywords, products_services, embedding_model, states, email_alerts",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar seu perfil: ${error.message}`);
  if (!data) {
    throw new Error(
      "Não foi possível carregar seu perfil. Confira se a migração do Supabase foi executada.",
    );
  }
  return {
    id: data.id,
    full_name: data.full_name,
    user_kind: data.user_kind as UserKind,
    categories: data.categories.filter(isOpportunityCategory),
    keywords: data.keywords,
    products_services: data.products_services,
    embedding_model: data.embedding_model,
    states: data.states ?? [],
    email_alerts: data.email_alerts,
  };
}

/**
 * Atualização ao vivo do PNCP: só para UFs com dados velhos e em segundo plano,
 * para não atrasar a página. O resultado aparece no próximo acesso. Sem estados
 * no perfil, usa as UFs fixas de `PNCP_UFS`.
 */
export async function scheduleLiveRefresh(supabase: Client, profileStates: readonly string[]) {
  const result = { scheduled: false, lastRefreshedAt: null as number | null, checkFailed: false };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return result;

  const liveStates = profileStates.length > 0 ? profileStates : getConfiguredStates().states;
  if (liveStates.length === 0) return result;

  try {
    const freshness = await getStaleStates(supabase, liveStates);
    result.lastRefreshedAt = freshness.lastRefreshedAt;
    if (freshness.stale.length > 0) {
      result.scheduled = true;
      after(async () => {
        try {
          await refreshLiveOpportunities(createServiceClient(), freshness.stale);
        } catch (error) {
          console.error("Background PNCP refresh failed.", { error: errorMessage(error) });
        }
      });
    }
  } catch (error) {
    result.checkFailed = true;
    console.error("Could not check PNCP data freshness.", { error: errorMessage(error) });
  }
  return result;
}

/** Documentos do usuário, para sugerir os que atendem cada requisito. */
export async function loadPriorDocuments(supabase: Client, userId: string) {
  try {
    return (await fetchAllPages((from, to) =>
      supabase
        .from("documents")
        .select("id, name, document_type, expires_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    )) as SuggestibleDocument[];
  } catch (error) {
    throw new Error(
      `Não foi possível carregar seus documentos para verificar as oportunidades: ${errorMessage(error)}`,
    );
  }
}

/** Requisitos já vinculados a algum documento, por oportunidade. */
export async function loadLinkedRequirements(
  supabase: Client,
  userId: string,
  opportunityIds: string[],
) {
  const linked = new Map<string, Set<string>>();
  if (opportunityIds.length === 0) return linked;
  const { data, error } = await supabase
    .from("document_opportunities")
    .select("opportunity_id, requirement")
    .eq("user_id", userId)
    .in("opportunity_id", opportunityIds);
  if (error) {
    throw new Error(
      `Não foi possível carregar os documentos vinculados às oportunidades: ${error.message}`,
    );
  }
  for (const link of data) {
    const requirements = linked.get(link.opportunity_id) ?? new Set<string>();
    requirements.add(link.requirement);
    linked.set(link.opportunity_id, requirements);
  }
  return linked;
}

/**
 * Lê em segundo plano os editais ainda não lidos das oportunidades da página
 * (na ordem de relevância). Continua depois da resposta e mesmo que a pessoa
 * saia; o que não couber em `maxDurationSeconds` fica para a próxima visita.
 */
export function canReadEditaisAutomatically() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function scheduleAutomaticEditalReads(
  opportunities: readonly Pick<Opportunity, "id" | "title" | "organization" | "summary">[],
  maxDurationSeconds: number,
) {
  if (opportunities.length === 0) return;
  if (!canReadEditaisAutomatically()) return;
  // Folga para a leitura em andamento terminar antes do limite da função.
  const stopAt = Date.now() + Math.max(0, maxDurationSeconds - 120) * 1000;
  const targets = opportunities.map(({ id, title, organization, summary }) => ({
    id,
    title,
    organization,
    summary,
  }));
  after(async () => {
    try {
      await readEditaisInBackground(createServiceClient(), targets, { stopAt });
    } catch (error) {
      console.error("Automatic edital reading could not run.", { error: errorMessage(error) });
    }
  });
}

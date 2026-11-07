import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDemoOpportunities,
  isDemoOpportunityId,
} from "@/lib/opportunities";
import type { OpportunityRecord } from "@/lib/sources/pncp";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Opportunity, OpportunityCategory } from "@/lib/types";

type Client = SupabaseClient<Database>;
type OpportunityInsert = Database["public"]["Tables"]["opportunities"]["Insert"];

const opportunityColumns =
  "id, source, category, title, organization, location, summary, tags, requirements, requirements_are_generic, deadline, published_at, first_seen_at, source_url";

/** O PostgREST limita cada resposta (padrão: 1000 linhas). */
const readPageSize = 1000;
/** Lotes menores evitam requisições grandes demais (o campo `raw` pesa). */
const writeBatchSize = 200;

type OpportunityRow = {
  id: string;
  source: "pncp";
  category: OpportunityCategory;
  title: string;
  organization: string;
  location: string;
  summary: string;
  tags: string[];
  requirements: string[];
  requirements_are_generic: boolean;
  deadline: string;
  published_at: string;
  first_seen_at: string;
  source_url: string;
};

/** Normaliza timestamps do PostgREST ("...+00:00") para ISO 8601 em UTC. */
function toIso(value: string) {
  return new Date(value).toISOString();
}

function rowToOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    source: row.source,
    category: row.category,
    title: row.title,
    organization: row.organization,
    location: row.location,
    summary: row.summary,
    tags: row.tags,
    requirements: row.requirements,
    requirementsAreGeneric: row.requirements_are_generic,
    deadline: toIso(row.deadline),
    publishedAt: toIso(row.published_at),
    firstSeenAt: toIso(row.first_seen_at),
    sourceUrl: row.source_url,
  };
}

/**
 * Oportunidades com prazo aberto nas categorias pedidas: as coletadas de fontes
 * reais e as de demonstração das categorias que ainda não têm fonte real.
 */
export async function listOpenOpportunities(
  supabase: Client,
  categories: readonly OpportunityCategory[],
): Promise<Opportunity[]> {
  if (categories.length === 0) return [];
  const now = new Date();
  const rows: OpportunityRow[] = [];

  for (let from = 0; ; from += readPageSize) {
    const { data, error } = await supabase
      .from("opportunities")
      .select(opportunityColumns)
      .is("closed_at", null)
      .gt("deadline", now.toISOString())
      .in("category", [...categories])
      .order("published_at", { ascending: false })
      .order("id")
      .range(from, from + readPageSize - 1);
    if (error) throw error;
    rows.push(...(data as OpportunityRow[]));
    if (data.length < readPageSize) break;
  }

  const demo = getDemoOpportunities(now).filter(
    (opportunity) =>
      categories.includes(opportunity.category) &&
      new Date(opportunity.deadline) > now,
  );
  return [...rows.map(rowToOpportunity), ...demo].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

export async function getOpportunityById(
  supabase: Client,
  id: string,
): Promise<Opportunity | null> {
  if (isDemoOpportunityId(id)) {
    return getDemoOpportunities().find((item) => item.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from("opportunities")
    .select(opportunityColumns)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToOpportunity(data as OpportunityRow) : null;
}

/**
 * Insere ou atualiza oportunidades. `first_seen_at` fica de fora do payload:
 * recebe o padrão `now()` na inserção e é preservado nas atualizações.
 */
export async function upsertOpportunities(
  supabase: Client,
  records: OpportunityRecord[],
  seenAt = new Date(),
): Promise<number> {
  const unique = [...new Map(records.map((record) => [record.id, record])).values()];
  const seenAtIso = seenAt.toISOString();

  const payload: OpportunityInsert[] = unique.map((record) => ({
    id: record.id,
    source: "pncp",
    external_id: record.externalId,
    region: record.region,
    category: record.category,
    title: record.title,
    organization: record.organization,
    location: record.location,
    summary: record.summary,
    tags: record.tags,
    requirements: record.requirements,
    requirements_are_generic: record.requirementsAreGeneric,
    deadline: record.deadline,
    published_at: record.publishedAt,
    source_url: record.sourceUrl,
    raw: record.raw as Json,
    last_seen_at: seenAtIso,
    closed_at: null,
    updated_at: seenAtIso,
  }));

  for (let start = 0; start < payload.length; start += writeBatchSize) {
    const { error } = await supabase
      .from("opportunities")
      .upsert(payload.slice(start, start + writeBatchSize), { onConflict: "id" });
    if (error) throw error;
  }
  return payload.length;
}

/**
 * Após ler todas as páginas de uma região, marca como encerradas as oportunidades
 * que deixaram de aparecer (revogadas, suspensas ou com propostas encerradas).
 */
export async function closeMissingOpportunities(
  supabase: Client,
  source: "pncp",
  region: string,
  seenSince: Date,
): Promise<number> {
  const now = new Date().toISOString();
  const { count, error } = await supabase
    .from("opportunities")
    .update({ closed_at: now, updated_at: now }, { count: "exact" })
    .eq("source", source)
    .eq("region", region)
    .is("closed_at", null)
    .lt("last_seen_at", seenSince.toISOString());
  if (error) throw error;
  return count ?? 0;
}

/** Remove registros com prazo encerrado há muito tempo para manter a tabela pequena. */
export async function pruneOldOpportunities(
  supabase: Client,
  olderThanDays = 90,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count, error } = await supabase
    .from("opportunities")
    .delete({ count: "exact" })
    .lt("deadline", cutoff.toISOString());
  if (error) throw error;
  return count ?? 0;
}

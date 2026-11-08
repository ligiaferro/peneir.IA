import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRecord } from "@/lib/sources/pncp";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Opportunity, OpportunityCategory } from "@/lib/types";

type Client = SupabaseClient<Database>;
type OpportunityInsert = Database["public"]["Tables"]["opportunities"]["Insert"];

const opportunityColumns =
  "id, source, region, category, title, organization, location, summary, tags, requirements, requirements_are_generic, deadline, published_at, first_seen_at, source_url";

/** O PostgREST limita cada resposta (padrão: 1000 linhas). */
const readPageSize = 1000;
/** Lotes menores evitam requisições grandes demais (o campo `raw` pesa). */
const writeBatchSize = 200;
const semanticMatchPageSize = 500;
const opportunityFetchBatchSize = 200;

type OpportunityRow = {
  id: string;
  source: "pncp";
  region: string;
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
    uf: row.region || null,
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
 * Oportunidades reais com prazo aberto nas categorias pedidas.
 * Com `states`, mantém só as dessas UFs; vazio = todos os estados.
 */
export async function listOpenOpportunities(
  supabase: Client,
  categories: readonly OpportunityCategory[],
  states: readonly string[] = [],
): Promise<Opportunity[]> {
  if (categories.length === 0) return [];
  const now = new Date();
  const rows: OpportunityRow[] = [];

  for (let from = 0; ; from += readPageSize) {
    let query = supabase
      .from("opportunities")
      .select(opportunityColumns)
      .eq("index_status", "indexed")
      .not("embedding", "is", null)
      .is("closed_at", null)
      .gt("deadline", now.toISOString())
      .in("category", [...categories]);
    // A coleta sempre grava a UF consultada em `region`.
    if (states.length > 0) query = query.in("region", [...states]);
    const { data, error } = await query
      .order("published_at", { ascending: false })
      .order("id")
      .range(from, from + readPageSize - 1);
    if (error) throw error;
    rows.push(...(data as OpportunityRow[]));
    if (data.length < readPageSize) break;
  }

  return rows.map(rowToOpportunity).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

export async function listMatchingOpportunities(
  supabase: Client,
  userId: string,
  categories: readonly OpportunityCategory[],
  regions: readonly string[],
  minimumSimilarity = -1,
): Promise<Opportunity[]> {
  if (categories.length === 0 || regions.length === 0) return [];
  const similarityById = new Map<string, number>();
  for (let offset = 0; ; offset += semanticMatchPageSize) {
    const { data, error } = await supabase.rpc("match_user_opportunities", {
      p_user_id: userId,
      p_categories: [...categories],
      p_regions: [...regions],
      p_min_similarity: minimumSimilarity,
      p_limit: semanticMatchPageSize,
      p_offset: offset,
    });
    if (error) throw error;
    for (const match of data) {
      similarityById.set(match.opportunity_id, match.similarity);
    }
    if (data.length < semanticMatchPageSize) break;
  }
  if (similarityById.size === 0) return [];

  const rows: OpportunityRow[] = [];
  const ids = [...similarityById.keys()];
  for (let start = 0; start < ids.length; start += opportunityFetchBatchSize) {
    const { data, error } = await supabase
      .from("opportunities")
      .select(opportunityColumns)
      .eq("index_status", "indexed")
      .not("embedding", "is", null)
      .is("closed_at", null)
      .gt("deadline", new Date().toISOString())
      .in("id", ids.slice(start, start + opportunityFetchBatchSize));
    if (error) throw error;
    rows.push(...(data as OpportunityRow[]));
  }

  return rows
    .map((row) => ({
      ...rowToOpportunity(row),
      matchScore: similarityById.get(row.id),
    }))
    .sort((left, right) => (right.matchScore ?? 0) - (left.matchScore ?? 0));
}

export async function getOpportunityById(
  supabase: Client,
  id: string,
): Promise<Opportunity | null> {
  const { data, error } = await supabase
    .from("opportunities")
    .select(opportunityColumns)
    .eq("id", id)
    .eq("index_status", "indexed")
    .not("embedding", "is", null)
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

/**
 * Remove oportunidades com prazo encerrado há muito tempo, preservando as que
 * têm documentos vinculados ou análises (o histórico dos usuários).
 */
export async function pruneOldOpportunities(
  supabase: Client,
  olderThanDays = 90,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase.rpc("prune_old_opportunities", {
    p_cutoff: cutoff.toISOString(),
  });
  if (error) throw error;
  return data ?? 0;
}

export type OpportunitySearch = {
  categories: readonly OpportunityCategory[];
  regions: readonly string[];
  query?: string;
  deadlineBefore?: Date | null;
  order?: "relevancia" | "prazo" | "recentes";
  page?: number;
  pageSize?: number;
};

/**
 * Busca paginada das oportunidades compatíveis com o perfil: filtro, ordem e
 * paginação acontecem no banco; só a página pedida é carregada.
 */
export async function searchMatchingOpportunities(
  supabase: Client,
  userId: string,
  {
    categories,
    regions,
    query = "",
    deadlineBefore = null,
    order = "relevancia",
    page = 1,
    pageSize = 24,
  }: OpportunitySearch,
): Promise<{ opportunities: Opportunity[]; total: number }> {
  if (categories.length === 0 || regions.length === 0) return { opportunities: [], total: 0 };
  const { data, error } = await supabase.rpc("search_user_opportunities", {
    p_user_id: userId,
    p_categories: [...categories],
    p_regions: [...regions],
    p_query: query.trim() || null,
    p_deadline_before: deadlineBefore?.toISOString() ?? null,
    p_order: order,
    p_limit: pageSize,
    p_offset: (Math.max(page, 1) - 1) * pageSize,
  });
  if (error) throw error;
  if (data.length === 0) return { opportunities: [], total: 0 };

  const { data: rows, error: rowsError } = await supabase
    .from("opportunities")
    .select(opportunityColumns)
    .in(
      "id",
      data.map((match) => match.opportunity_id),
    );
  if (rowsError) throw rowsError;
  const rowsById = new Map((rows as OpportunityRow[]).map((row) => [row.id, row]));
  const opportunities = data.flatMap((match) => {
    const row = rowsById.get(match.opportunity_id);
    return row ? [{ ...rowToOpportunity(row), matchScore: match.similarity }] : [];
  });
  return { opportunities, total: Number(data[0].total_count) };
}

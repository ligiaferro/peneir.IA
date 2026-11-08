import type { SupabaseClient } from "@supabase/supabase-js";
import { mapWithConcurrency } from "@/lib/concurrency";
import { indexPendingOpportunities } from "@/lib/opportunity-indexing";
import { upsertOpportunities } from "@/lib/opportunity-store";
import {
  fetchOpenContratacoes,
  mapPncpContratacao,
  pncpDateParam,
  type OpportunityRecord,
} from "@/lib/sources/pncp";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Dados de uma UF mais novos que isso não disparam nova consulta ao PNCP. */
export const liveRefreshMaxAgeMs = 30 * 60 * 1000;

/** Quando a UF foi atualizada pela última vez (pelo cron ou pelo painel). */
export async function getStaleStates(
  supabase: Client,
  states: readonly string[],
  now = Date.now(),
) {
  const results = await Promise.all(
    states.map(async (uf) => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("last_seen_at")
        .eq("source", "pncp")
        .eq("region", uf)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const lastSeen = data ? new Date(data.last_seen_at).getTime() : 0;
      return { uf, lastSeen };
    }),
  );
  return {
    stale: results.filter(({ lastSeen }) => now - lastSeen > liveRefreshMaxAgeMs).map(({ uf }) => uf),
    lastRefreshedAt: results.reduce<number | null>(
      (latest, { lastSeen }) => (lastSeen > 0 && (latest === null || lastSeen < latest) ? lastSeen : latest),
      null,
    ),
  };
}

function readPositiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

/**
 * Busca a primeira página do PNCP das UFs pedidas, grava e vetoriza o que for
 * novo. Feita em segundo plano (after), fora do tempo de carregamento da página.
 */
export async function refreshLiveOpportunities(supabase: Client, states: readonly string[]) {
  const daysAhead = readPositiveInteger(process.env.PNCP_DAYS_AHEAD, 60, 365);
  const concurrency = readPositiveInteger(process.env.PNCP_CONCURRENCY, 3, 6);
  const userAgent = `peneir.IA/0.1 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://peneir.ia"})`;

  const results = await mapWithConcurrency(
    states,
    concurrency,
    async (uf): Promise<OpportunityRecord[]> => {
      try {
        const result = await fetchOpenContratacoes({
          uf,
          dataFinal: pncpDateParam(daysAhead),
          maxPages: 1,
          pageSize: 50,
          retryDelaysMs: [3_000],
          userAgent,
        });
        const fetchedAt = new Date().toISOString();
        return result.items
          .map((item) => mapPncpContratacao(item, fetchedAt, uf))
          .filter((record): record is OpportunityRecord => record !== null);
      } catch (error) {
        console.error("PNCP background refresh failed.", {
          uf,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
  );

  const records = results.flat();
  if (records.length > 0) await upsertOpportunities(supabase, records);
  const ids = [...new Set(records.map(({ id }) => id))];
  for (let start = 0; start < ids.length; start += 100) {
    await indexPendingOpportunities(supabase, { ids: ids.slice(start, start + 100), limit: 100 });
  }
  await indexPendingOpportunities(supabase, { limit: 50 });
}

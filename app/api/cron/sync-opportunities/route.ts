import { NextResponse, type NextRequest } from "next/server";
import { mapWithConcurrency } from "@/lib/concurrency";
import { isCronAuthorized } from "@/lib/cron-auth";
import {
  closeMissingOpportunities,
  pruneOldOpportunities,
  upsertOpportunities,
} from "@/lib/opportunity-store";
import { indexPendingOpportunities } from "@/lib/opportunity-indexing";
import {
  fetchOpenContratacoes,
  mapPncpContratacao,
  pncpDateParam,
  type OpportunityRecord,
} from "@/lib/sources/pncp";
import { normalizeStates } from "@/lib/states";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function readPositiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

/** O PostgREST limita cada resposta (padrão: 1000 linhas). */
const readPageSize = 1000;

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * UFs escolhidas nos perfis de quem acompanha licitações (ou não marcou
 * categoria, o que equivale a todas).
 */
async function loadProfileStates(supabase: ServiceClient) {
  const states = new Set<string>();
  for (let from = 0; ; from += readPageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("states, categories")
      .order("id")
      .range(from, from + readPageSize - 1);
    if (error) throw error;
    for (const profile of data) {
      if (profile.categories.length > 0 && !profile.categories.includes("licitacoes")) {
        continue;
      }
      for (const state of profile.states) states.add(state);
    }
    if (data.length < readPageSize) break;
  }
  return normalizeStates(states).states;
}

const indexingBatchSize = 100;
/** Teto de lotes por execução; o restante fica para a próxima. */
const maxIndexingBatches = 20;

/** Vetoriza as oportunidades pendentes em lotes, enquanto houver tempo. */
async function indexCollectedOpportunities(supabase: ServiceClient, stopAt: number) {
  const summary = { indexed: 0, failed: 0, complete: false, error: undefined as string | undefined };
  try {
    for (let batch = 0; batch < maxIndexingBatches && Date.now() < stopAt; batch += 1) {
      const result = await indexPendingOpportunities(supabase, {
        limit: indexingBatchSize,
      });
      summary.indexed += result.indexed;
      summary.failed += result.failed;
      if (result.selected < indexingBatchSize) {
        summary.complete = true;
        break;
      }
      // Linhas que falharam voltam à fila; parar evita repetir as mesmas.
      if (result.failed > 0) break;
    }
  } catch (error) {
    summary.error =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Erro desconhecido.";
    console.error("Could not index PNCP opportunities.", { error: summary.error });
  }
  if (summary.failed > 0 && !summary.error) {
    summary.error = `${summary.failed} oportunidade(s) falharam na vetorização.`;
  }
  return summary;
}

type RegionSummary = {
  uf: string;
  fetched: number;
  saved: number;
  closed: number;
  pages: number;
  complete: boolean;
  error?: string;
};

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  const { states: configuredStates, invalid } = normalizeStates(
    (process.env.PNCP_UFS ?? "PE").split(","),
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `PNCP_UFS inválido: ${invalid.join(", ")}.` },
      { status: 500 },
    );
  }

  const supabase = createServiceClient();
  let profileStates: string[] = [];
  let profileStatesError: string | undefined;
  try {
    profileStates = await loadProfileStates(supabase);
  } catch (error) {
    profileStatesError =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Erro desconhecido.";
    console.error("Could not load profile states for PNCP sync.", {
      error: profileStatesError,
    });
  }
  // As UFs fixas vêm primeiro, para terem prioridade se o tempo acabar.
  const states = [...new Set([...configuredStates, ...profileStates])];
  if (states.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma UF para coletar: configure PNCP_UFS ou escolha estados em um perfil." },
      { status: 500 },
    );
  }

  const concurrency = readPositiveInteger(process.env.PNCP_CONCURRENCY, 3, 6);
  const maxPages = readPositiveInteger(process.env.PNCP_MAX_PAGES, 20, 200);
  const daysAhead = readPositiveInteger(process.env.PNCP_DAYS_AHEAD, 60, 365);
  const dataFinal = pncpDateParam(daysAhead);
  // Deixa folga antes do limite de execução da função.
  const stopAt = Date.now() + (maxDuration - 30) * 1000;
  const userAgent = `peneir.IA/0.1 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://peneir.ia"})`;

  // Cada UF é uma consulta independente; até `concurrency` rodam ao mesmo tempo.
  const regions = await mapWithConcurrency(states, concurrency, async (uf) => {
    const summary: RegionSummary = {
      uf,
      fetched: 0,
      saved: 0,
      closed: 0,
      pages: 0,
      complete: false,
    };
    if (Date.now() >= stopAt) {
      summary.error = "Tempo de execução esgotado antes desta UF.";
      return summary;
    }

    try {
      const runStartedAt = new Date();
      const result = await fetchOpenContratacoes({
        uf,
        dataFinal,
        maxPages,
        stopAt,
        userAgent,
      });
      summary.fetched = result.items.length;
      summary.pages = result.pagesFetched;
      summary.complete = result.complete;
      if (result.error) summary.error = result.error;

      const seenAt = new Date();
      const records = result.items
        .map((item) => mapPncpContratacao(item, seenAt.toISOString(), uf))
        .filter((record): record is OpportunityRecord => record !== null);

      summary.saved = await upsertOpportunities(supabase, records, seenAt);
      // Só encerra registros ausentes quando a listagem da UF foi lida por completo.
      if (result.complete) {
        summary.closed = await closeMissingOpportunities(
          supabase,
          "pncp",
          uf,
          runStartedAt,
        );
      }
    } catch (error) {
      summary.error =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String(error.message)
            : "Erro desconhecido.";
      console.error("PNCP sync failed.", { uf, error: summary.error });
    }
    return summary;
  });

  // A vetorização roda depois da coleta, e não dentro de cada UF: ela pega as
  // pendentes de todas as UFs, e chamadas em paralelo vetorizariam as mesmas
  // linhas em duplicidade.
  const indexing = await indexCollectedOpportunities(supabase, stopAt);

  let pruned = 0;
  try {
    pruned = await pruneOldOpportunities(supabase);
  } catch {
    console.error("Could not prune old opportunities.");
  }

  const failed =
    Boolean(profileStatesError) ||
    Boolean(indexing.error) ||
    indexing.failed > 0 ||
    regions.some((region) => region.error);
  const incomplete =
    !indexing.complete || regions.some((region) => !region.complete);
  return NextResponse.json(
    {
      status: failed ? "partial_failure" : incomplete ? "incomplete" : "complete",
      dataFinal,
      concurrency,
      configuredStates,
      profileStates,
      ...(profileStatesError && { profileStatesError }),
      regions,
      indexing,
      pruned,
    },
    { status: failed ? 502 : 200 },
  );
}

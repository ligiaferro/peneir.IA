import { NextResponse, type NextRequest } from "next/server";
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
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const brazilianStates = new Set(
  "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" "),
);

function readPositiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function readStates() {
  const states = (process.env.PNCP_UFS ?? "PE")
    .split(",")
    .map((state) => state.trim().toUpperCase())
    .filter(Boolean);
  const invalid = states.filter((state) => !brazilianStates.has(state));
  return { states: [...new Set(states)], invalid };
}

type RegionSummary = {
  uf: string;
  fetched: number;
  saved: number;
  indexed: number;
  indexingFailed: number;
  indexingComplete: boolean;
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

  const { states, invalid } = readStates();
  if (invalid.length > 0 || states.length === 0) {
    return NextResponse.json(
      { error: `PNCP_UFS inválido: ${invalid.join(", ") || "vazio"}.` },
      { status: 500 },
    );
  }
  const maxPages = readPositiveInteger(process.env.PNCP_MAX_PAGES, 20, 200);
  const daysAhead = readPositiveInteger(process.env.PNCP_DAYS_AHEAD, 60, 365);
  const dataFinal = pncpDateParam(daysAhead);
  // Deixa folga antes do limite de execução da função.
  const stopAt = Date.now() + (maxDuration - 30) * 1000;
  const userAgent = `peneir.IA/0.1 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://peneir.ia"})`;

  const supabase = createServiceClient();
  const regions: RegionSummary[] = [];
  for (const uf of states) {
    const summary: RegionSummary = {
      uf,
      fetched: 0,
      saved: 0,
      indexed: 0,
      indexingFailed: 0,
      indexingComplete: true,
      closed: 0,
      pages: 0,
      complete: false,
    };
    regions.push(summary);
    if (Date.now() >= stopAt) {
      summary.error = "Tempo de execução esgotado antes desta UF.";
      continue;
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
      const indexing = await indexPendingOpportunities(supabase, {
        limit: 100,
      });
      summary.indexed = indexing.indexed;
      summary.indexingFailed = indexing.failed;
      summary.indexingComplete = indexing.selected < 100;
      if (indexing.failed > 0) {
        summary.error = `${indexing.failed} oportunidade(s) falharam na vetorização.`;
      }
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
  }

  let pruned = 0;
  try {
    pruned = await pruneOldOpportunities(supabase);
  } catch {
    console.error("Could not prune old opportunities.");
  }

  const failed = regions.some((region) => region.error);
  const incomplete = regions.some(
    (region) => !region.complete || !region.indexingComplete,
  );
  return NextResponse.json(
    {
      status: failed ? "partial_failure" : incomplete ? "incomplete" : "complete",
      dataFinal,
      regions,
      pruned,
    },
    { status: failed ? 502 : 200 },
  );
}

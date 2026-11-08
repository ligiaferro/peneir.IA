import type { SupabaseClient } from "@supabase/supabase-js";
import { readPositiveInteger } from "@/lib/config";
import { processOpportunityEdital } from "@/lib/edital";
import type { Database } from "@/lib/supabase/database.types";
import type { Opportunity } from "@/lib/types";

type Client = SupabaseClient<Database>;
type EditalTarget = Pick<Opportunity, "id" | "title" | "organization" | "summary">;

/**
 * Leituras automáticas de edital em segundo plano, no servidor. Rodam fora da
 * requisição (`after`), então continuam mesmo que a pessoa saia da página.
 * Poucas leituras ocorrem ao mesmo tempo: as demais esperam sua vez.
 */

/** Leituras simultâneas por instância do servidor (`EDITAL_READ_CONCURRENCY`, 1 a 4). */
export function getEditalReadConcurrency() {
  return readPositiveInteger(process.env.EDITAL_READ_CONCURRENCY, 2, 4);
}

let running = 0;
const waiters: Array<() => void> = [];
/** Ids já na fila ou em leitura nesta instância (evita duplicar entre abas). */
const activeIds = new Set<string>();

async function acquire(limit: number) {
  while (running >= limit) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  running += 1;
}

function release() {
  running -= 1;
  waiters.shift()?.();
}

type Options = {
  /** Instante (ms) a partir do qual não se começa nova leitura. */
  stopAt: number;
  concurrency?: number;
  /** Leitura de um edital; injetável para testes. */
  process?: (admin: Client, opportunity: EditalTarget) => Promise<unknown>;
};

/**
 * Lê, na ordem recebida, os editais ainda não lidos. Cada leitura só começa
 * quando há vaga e é reservada no banco (`claim_edital_processing`), então
 * outra aba, usuário ou instância nunca lê o mesmo edital duas vezes. O que
 * não der tempo antes de `stopAt` fica para a próxima visita ao painel.
 */
export async function readEditaisInBackground(
  admin: Client,
  opportunities: readonly EditalTarget[],
  { stopAt, concurrency = getEditalReadConcurrency(), process = processOpportunityEdital }: Options,
) {
  const result = { started: 0, skipped: 0, deferred: 0 };
  const mine = opportunities.filter(({ id }) => !activeIds.has(id));
  result.skipped = opportunities.length - mine.length;
  for (const { id } of mine) activeIds.add(id);

  await Promise.all(
    mine.map(async (opportunity) => {
      try {
        await acquire(concurrency);
        try {
          if (Date.now() >= stopAt) {
            result.deferred += 1;
            return;
          }
          const { data: claimed, error } = await admin.rpc("claim_edital_processing", {
            p_opportunity_id: opportunity.id,
            p_force: false,
          });
          if (error) {
            console.error("Could not claim edital processing.", { error: error.message });
            return;
          }
          if (!claimed) return;
          result.started += 1;
          await process(admin, opportunity);
        } finally {
          release();
        }
      } catch (error) {
        console.error("Automatic edital reading failed.", {
          opportunityId: opportunity.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        activeIds.delete(opportunity.id);
      }
    }),
  );
  return result;
}

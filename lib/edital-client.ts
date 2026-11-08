import type { EditalStatus } from "@/lib/edital-insights";

/**
 * Acompanhamento (navegador) da leitura de editais pelos cards do painel. A
 * leitura em si roda no servidor; aqui há um único acompanhamento em lote
 * (`GET /api/edital?ids=a,b,c`) para a página inteira, em vez de um por card.
 */

export type EditalSnapshot = { status: EditalStatus; requirements: string[] };
/** `null` = desistiu de acompanhar (demorou demais). */
type Listener = (edital: EditalSnapshot | null) => void;

/** Intervalo entre consultas em lote: começa curto e aumenta se demorar. */
const pollDelaysMs = [4_000, 6_000, 10_000, 15_000];
/** Desiste de acompanhar um edital depois disso. */
const watchTimeoutMs = 20 * 60_000;
const maxIdsPerRequest = 50;

type Watch = { listeners: Set<Listener>; startedAt: number };
const watches = new Map<string, Watch>();
let timer: ReturnType<typeof setTimeout> | null = null;
let round = 0;

function schedule() {
  if (timer !== null || watches.size === 0) return;
  const delay = pollDelaysMs[Math.min(round, pollDelaysMs.length - 1)];
  timer = setTimeout(() => {
    timer = null;
    void pollOnce();
  }, delay);
}

async function pollOnce() {
  const now = Date.now();
  for (const [id, watch] of watches) {
    if (now - watch.startedAt > watchTimeoutMs) {
      watches.delete(id);
      watch.listeners.forEach((listener) => listener(null));
    }
  }
  // Com a aba em segundo plano não há por que consultar.
  if (typeof document !== "undefined" && document.hidden) {
    schedule();
    return;
  }
  const ids = [...watches.keys()].slice(0, maxIdsPerRequest);
  if (ids.length === 0) return;

  try {
    const response = await fetch(`/api/edital?ids=${ids.map(encodeURIComponent).join(",")}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const body = (await response.json()) as {
        editais?: Record<string, EditalSnapshot | null>;
      };
      for (const id of ids) {
        const edital = body.editais?.[id];
        if (!edital || edital.status === "processing") continue;
        const watch = watches.get(id);
        watches.delete(id);
        watch?.listeners.forEach((listener) => listener(edital));
      }
    }
  } catch {
    // Rede instável: tenta de novo na próxima rodada.
  }
  round += 1;
  if (watches.size === 0) round = 0;
  schedule();
}

/** Acompanha um edital em processamento; devolve a função que cancela. */
export function watchEdital(id: string, listener: Listener) {
  const watch = watches.get(id) ?? { listeners: new Set<Listener>(), startedAt: Date.now() };
  watch.listeners.add(listener);
  watches.set(id, watch);
  schedule();
  return () => {
    watch.listeners.delete(listener);
    if (watch.listeners.size === 0 && watches.get(id) === watch) watches.delete(id);
  };
}

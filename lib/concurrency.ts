/**
 * Aplica `worker` a cada item com no máximo `limit` execuções simultâneas.
 * Os resultados mantêm a ordem dos itens. Erros do `worker` são propagados;
 * quem precisa de tolerância a falhas deve tratá-los dentro dele.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: workers }, run));
  return results;
}

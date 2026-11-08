/** O PostgREST limita cada resposta (padrão: 1000 linhas). */
export const defaultReadPageSize = 1000;

/**
 * Lê todas as linhas de uma consulta paginada com `.range(from, to)`.
 * `fetchPage` recebe os limites e devolve o resultado do Supabase; qualquer
 * erro é propagado.
 */
export async function fetchAllPages<Row>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  pageSize = defaultReadPageSize,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

import { isBrazilianState } from "@/lib/states";

/** Filtros do painel, lidos da URL (?q=&uf=&prazo=&ordem=&pagina=). */

export const dashboardPageSize = 24;

export const deadlineOptions = [
  { value: "", label: "Qualquer prazo" },
  { value: "7", label: "Encerra em até 7 dias" },
  { value: "15", label: "Encerra em até 15 dias" },
  { value: "30", label: "Encerra em até 30 dias" },
] as const;

export const orderOptions = [
  { value: "relevancia", label: "Mais compatíveis" },
  { value: "prazo", label: "Prazo mais próximo" },
  { value: "recentes", label: "Publicadas recentemente" },
] as const;

export type DashboardOrder = (typeof orderOptions)[number]["value"];

export type DashboardFilters = {
  query: string;
  /** UF escolhida no filtro, já validada contra as UFs permitidas; "" = todas. */
  uf: string;
  deadlineDays: number | null;
  order: DashboardOrder;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseDashboardFilters(
  params: SearchParams,
  allowedStates: readonly string[],
): DashboardFilters {
  const query = first(params.q).replace(/\s+/g, " ").trim().slice(0, 120);
  const uf = first(params.uf).trim().toUpperCase();
  const deadline = Number.parseInt(first(params.prazo), 10);
  const order = first(params.ordem);
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    query,
    uf: isBrazilianState(uf) && allowedStates.includes(uf) ? uf : "",
    deadlineDays: [7, 15, 30].includes(deadline) ? deadline : null,
    order: orderOptions.some((option) => option.value === order)
      ? (order as DashboardOrder)
      : "relevancia",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

/** Monta a URL do painel mantendo os filtros e trocando o que for passado. */
export function dashboardHref(filters: DashboardFilters, changes: Partial<DashboardFilters> = {}) {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.query) params.set("q", next.query);
  if (next.uf) params.set("uf", next.uf);
  if (next.deadlineDays) params.set("prazo", String(next.deadlineDays));
  if (next.order !== "relevancia") params.set("ordem", next.order);
  if (next.page > 1) params.set("pagina", String(next.page));
  const search = params.toString();
  return `/dashboard${search ? `?${search}` : ""}#oportunidades`;
}

export function hasActiveFilters(filters: DashboardFilters) {
  return Boolean(filters.query || filters.uf || filters.deadlineDays);
}

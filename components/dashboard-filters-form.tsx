import Form from "next/form";
import Link from "next/link";
import {
  deadlineOptions,
  hasActiveFilters,
  orderOptions,
  type DashboardFilters,
} from "@/lib/dashboard-filters";
import { brazilianStates } from "@/lib/states";

/**
 * Barra de busca e filtros do painel. Usa o `Form` do Next (navegação no
 * cliente sem rolar para o topo) e cai para um GET comum sem JavaScript.
 */
export function DashboardFiltersForm({
  filters,
  states,
  usesProfileStates,
}: {
  filters: DashboardFilters;
  states: readonly string[];
  usesProfileStates: boolean;
}) {
  return (
    <Form
      // Remonta quando os filtros mudam (ex.: "Limpar"), pois os campos são
      // não controlados e manteriam os valores antigos na navegação no cliente.
      key={JSON.stringify(filters)}
      className="dashboard-filters"
      action="/dashboard"
      scroll={false}
    >
      <div className="field dashboard-filter-search">
        <label htmlFor="filtro-q">Buscar</label>
        <input
          id="filtro-q"
          name="q"
          type="search"
          defaultValue={filters.query}
            placeholder="Objeto, órgão ou cidade"
            maxLength={120}
          />
        </div>
        <div className="field">
        <label htmlFor="filtro-uf">Estado</label>
        <select id="filtro-uf" name="uf" defaultValue={filters.uf}>
          <option value="">
            {usesProfileStates ? "Meus estados" : "Todos"}
          </option>
          {states.map((uf) => (
            <option key={uf} value={uf}>
              {uf} · {brazilianStates[uf as keyof typeof brazilianStates]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="filtro-prazo">Prazo</label>
        <select
          id="filtro-prazo"
          name="prazo"
          defaultValue={filters.deadlineDays ? String(filters.deadlineDays) : ""}
        >
          {deadlineOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="filtro-ordem">Ordenar por</label>
        <select id="filtro-ordem" name="ordem" defaultValue={filters.order}>
          {orderOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="dashboard-filter-actions">
        <button className="button button-small" type="submit">
          Aplicar
        </button>
        {(hasActiveFilters(filters) || filters.order !== "relevancia") && (
          <Link className="button button-secondary button-small" href="/dashboard#oportunidades">
            Limpar
          </Link>
        )}
      </div>
    </Form>
  );
}

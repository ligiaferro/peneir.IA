"use client";

import { useState } from "react";
import {
  brazilianRegions,
  brazilianStateCodes,
  brazilianStates,
  type BrazilianState,
} from "@/lib/states";

/**
 * Seleção de estados de atuação, com atalhos: todos, nenhum, inverter e por
 * região. Os checkboxes continuam enviando `states` no formulário.
 */
export function StatePicker({ initial }: { initial: readonly string[] }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(initial));

  const total = brazilianStateCodes.length;
  const allSelected = selected.size === total;

  function toggle(state: BrazilianState) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  }

  function toggleRegion(states: readonly BrazilianState[]) {
    setSelected((current) => {
      const next = new Set(current);
      if (states.every((state) => next.has(state))) {
        for (const state of states) next.delete(state);
      } else {
        for (const state of states) next.add(state);
      }
      return next;
    });
  }

  return (
    <fieldset className="state-picker">
      <legend className="field-label">Estados de atuação</legend>
      <p className="field-hint">
        Marque os estados onde quer encontrar oportunidades. Sem estado marcado,
        mostramos oportunidades de todos os estados.
      </p>
      <div className="state-picker-actions" role="group" aria-label="Atalhos de seleção">
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => setSelected(new Set(brazilianStateCodes))}
          disabled={allSelected}
        >
          Selecionar todos
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => setSelected(new Set())}
          disabled={selected.size === 0}
        >
          Limpar
        </button>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() =>
            setSelected(new Set(brazilianStateCodes.filter((state) => !selected.has(state))))
          }
        >
          Inverter
        </button>
      </div>
      <div className="state-picker-actions" role="group" aria-label="Selecionar por região">
        {brazilianRegions.map((region) => {
          const full = region.states.every((state) => selected.has(state));
          return (
            <button
              key={region.id}
              type="button"
              className="button button-secondary button-small"
              aria-pressed={full}
              onClick={() => toggleRegion(region.states)}
            >
              {region.name}
            </button>
          );
        })}
      </div>
      <div className="category-options state-options">
        {brazilianStateCodes.map((state) => (
          <label className="category-option" key={state} title={brazilianStates[state]}>
            <input
              type="checkbox"
              name="states"
              value={state}
              checked={selected.has(state)}
              onChange={() => toggle(state)}
            />
            {state}
          </label>
        ))}
      </div>
      <p className="field-hint" aria-live="polite">
        {selected.size === 0
          ? "Nenhum estado marcado: valem todos os estados."
          : `${selected.size} de ${total} estados selecionados.`}
      </p>
    </fieldset>
  );
}

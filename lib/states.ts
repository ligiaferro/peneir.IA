/** Unidades federativas do Brasil, na ordem das siglas. */
export const brazilianStates = {
  AC: "Acre",
  AL: "Alagoas",
  AM: "Amazonas",
  AP: "Amapá",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MG: "Minas Gerais",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  SE: "Sergipe",
  SP: "São Paulo",
  TO: "Tocantins",
} as const;

export type BrazilianState = keyof typeof brazilianStates;

/** Regiões do IBGE, para marcar vários estados de uma vez. */
export const brazilianRegions = [
  { id: "norte", name: "Norte", states: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"] },
  {
    id: "nordeste",
    name: "Nordeste",
    states: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  },
  { id: "centro-oeste", name: "Centro-Oeste", states: ["DF", "GO", "MS", "MT"] },
  { id: "sudeste", name: "Sudeste", states: ["ES", "MG", "RJ", "SP"] },
  { id: "sul", name: "Sul", states: ["PR", "RS", "SC"] },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  states: readonly BrazilianState[];
}>;

export const brazilianStateCodes = Object.keys(brazilianStates) as BrazilianState[];

export function isBrazilianState(value: string): value is BrazilianState {
  return Object.hasOwn(brazilianStates, value);
}

/**
 * Normaliza uma lista de UFs: maiúsculas, sem repetição e na ordem das siglas.
 * Valores que não são UFs vão para `invalid`.
 */
export function normalizeStates(values: Iterable<string>) {
  const valid = new Set<BrazilianState>();
  const invalid: string[] = [];
  for (const value of values) {
    const state = value.trim().toUpperCase();
    if (!state) continue;
    if (isBrazilianState(state)) valid.add(state);
    else invalid.push(state);
  }
  return {
    states: brazilianStateCodes.filter((state) => valid.has(state)),
    invalid,
  };
}

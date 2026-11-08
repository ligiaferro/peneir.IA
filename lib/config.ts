import { normalizeStates, type BrazilianState } from "@/lib/states";

/** Configuração central: valores padrão e leitura das variáveis de ambiente. */

export const appName = "peneir.IA";
const fallbackAppUrl = "https://peneir.ia";

/** URL pública do app, sem barra final; null se não estiver configurada. */
export function getAppUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return url || null;
}

/** User-Agent das consultas a fontes externas (PNCP e arquivos de edital). */
export function getUserAgent() {
  return `${appName}/0.1 (+${getAppUrl() ?? fallbackAppUrl})`;
}

export const defaultChatModel = "gpt-4o-mini";

/** Modelo da análise de documentos. */
export function getChatModel() {
  return process.env.OPENAI_MODEL?.trim() || defaultChatModel;
}

/** Modelo da leitura de editais; pode ser um mais rápido que o da análise. */
export function getEditalModel() {
  return process.env.OPENAI_EDITAL_MODEL?.trim() || getChatModel();
}

/** Lê um inteiro positivo de uma variável, limitado a `max`. */
export function readPositiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

/** Parâmetros da coleta no PNCP. */
export function getPncpSettings() {
  return {
    daysAhead: readPositiveInteger(process.env.PNCP_DAYS_AHEAD, 60, 365),
    concurrency: readPositiveInteger(process.env.PNCP_CONCURRENCY, 3, 6),
    maxPages: readPositiveInteger(process.env.PNCP_MAX_PAGES, 20, 200),
  };
}

/**
 * UFs coletadas sempre (`PNCP_UFS`), somadas às escolhidas nos perfis. Sem a
 * variável não há UF fixa: só as dos perfis são coletadas. `invalid` lista
 * valores que não são UFs.
 */
export function getConfiguredStates(): { states: BrazilianState[]; invalid: string[] } {
  return normalizeStates((process.env.PNCP_UFS ?? "").split(","));
}

/** Intervalo mínimo entre duas consultas de CNPJ do mesmo usuário. */
export const cnpjLookupCooldownSeconds = 5;

/** Intervalo mínimo entre dois envios imediatos de alerta (painel). */
export const immediateAlertCooldownSeconds = 60;

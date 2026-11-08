import type { Opportunity } from "@/lib/types";

/**
 * Cliente da API de consulta do PNCP (Portal Nacional de Contratações Públicas).
 * Documentação: https://pncp.gov.br/api/consulta/swagger-ui/index.html
 *
 * Usa o endpoint "Contratações com Recebimento de Propostas Aberto", que devolve
 * apenas compras com propostas abertas e encerramento até `dataFinal`.
 * A API limita requisições (HTTP 429 sem Retry-After), por isso as páginas são
 * buscadas em sequência, com pausa e retentativas.
 */

export const pncpConsultaBaseUrl = "https://pncp.gov.br/api/consulta";
const brasiliaOffset = "-03:00";
const situacaoDivulgada = 1;

export type PncpContratacao = {
  numeroControlePNCP: string;
  anoCompra: number;
  sequencialCompra: number;
  objetoCompra: string | null;
  informacaoComplementar: string | null;
  modalidadeNome: string | null;
  situacaoCompraId: number | null;
  srp: boolean | null;
  valorTotalEstimado: number | null;
  dataPublicacaoPncp: string | null;
  dataEncerramentoProposta: string | null;
  orgaoEntidade: { cnpj: string | null; razaoSocial: string | null } | null;
  unidadeOrgao: {
    ufSigla: string | null;
    municipioNome: string | null;
    nomeUnidade: string | null;
  } | null;
  amparoLegal?: { nome?: string | null } | null;
};

type PncpPage = {
  data?: PncpContratacao[];
  totalPaginas?: number;
  paginasRestantes?: number;
};

export type OpportunityRecord = Opportunity & {
  externalId: string;
  region: string;
  raw: unknown;
};

/**
 * Requisitos usuais de habilitação da Lei 14.133/2021 (arts. 62 a 70).
 * A API de consulta não traz os requisitos do edital; esta lista orienta a
 * análise e é sinalizada como genérica na interface.
 */
export const genericBiddingRequirements = [
  "Habilitação jurídica (ato constitutivo e inscrição no CNPJ)",
  "Regularidade fiscal, social e trabalhista (certidões negativas ou positivas com efeito de negativa)",
  "Qualificação econômico-financeira (balanço patrimonial e certidão de falência)",
  "Qualificação técnica (atestados de capacidade técnica)",
  "Proposta comercial conforme o edital",
];

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Datas do PNCP vêm no horário de Brasília, sem fuso. */
export function parsePncpDateTime(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}${brasiliaOffset}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Converte uma contratação do PNCP para o formato interno.
 * Retorna null para registros incompletos ou que não estão mais divulgados.
 *
 * `queriedUf` é a UF usada na consulta. Ela é gravada como `region` porque o
 * encerramento das oportunidades ausentes filtra por essa mesma UF; usar o
 * `ufSigla` do registro deixaria abertos os itens em que ele vem vazio ou
 * diferente.
 */
export function mapPncpContratacao(
  item: PncpContratacao,
  firstSeenAt = new Date().toISOString(),
  queriedUf?: string,
): OpportunityRecord | null {
  if (item.situacaoCompraId !== situacaoDivulgada) return null;

  const cnpj = item.orgaoEntidade?.cnpj ?? "";
  const objeto = cleanText(item.objetoCompra);
  const deadline = parsePncpDateTime(item.dataEncerramentoProposta);
  const publishedAt = parsePncpDateTime(item.dataPublicacaoPncp);
  if (
    !item.numeroControlePNCP ||
    !/^\d{14}$/.test(cnpj) ||
    !Number.isInteger(item.anoCompra) ||
    !Number.isInteger(item.sequencialCompra) ||
    !objeto ||
    !deadline ||
    !publishedAt
  ) {
    return null;
  }

  const organization =
    cleanText(item.orgaoEntidade?.razaoSocial) ||
    cleanText(item.unidadeOrgao?.nomeUnidade) ||
    "Órgão não informado";
  const unit = cleanText(item.unidadeOrgao?.nomeUnidade);
  const city = cleanText(item.unidadeOrgao?.municipioNome);
  const uf = cleanText(item.unidadeOrgao?.ufSigla).toUpperCase();
  const complement = cleanText(item.informacaoComplementar);
  const modality = cleanText(item.modalidadeNome);

  const summaryParts = [truncate(objeto, 1000)];
  if (complement && complement.toLowerCase() !== objeto.toLowerCase()) {
    summaryParts.push(truncate(complement, 500));
  }
  if (unit && unit.toLowerCase() !== organization.toLowerCase()) {
    summaryParts.push(`Unidade: ${unit}.`);
  }
  if (typeof item.valorTotalEstimado === "number" && item.valorTotalEstimado > 0) {
    summaryParts.push(
      `Valor estimado: ${currencyFormatter.format(item.valorTotalEstimado)}.`,
    );
  }

  const tags = [
    modality,
    item.srp ? "registro de preços" : "",
    cleanText(item.amparoLegal?.nome),
  ]
    .filter(Boolean)
    .map((tag) => tag.toLocaleLowerCase("pt-BR"));

  return {
    id: `pncp:${item.numeroControlePNCP}`,
    externalId: item.numeroControlePNCP,
    source: "pncp",
    region: queriedUf?.trim().toUpperCase() || uf,
    category: "licitacoes",
    title: truncate(objeto, 160),
    organization,
    location: [city, uf].filter(Boolean).join(", ") || "Brasil",
    summary: summaryParts.join(" "),
    tags: [...new Set(tags)],
    requirements: genericBiddingRequirements,
    requirementsAreGeneric: true,
    deadline,
    publishedAt,
    firstSeenAt,
    sourceUrl: `https://pncp.gov.br/app/editais/${cnpj}/${item.anoCompra}/${item.sequencialCompra}`,
    raw: item,
  };
}

export class PncpRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PncpRequestError";
  }
}

export type FetchOpenContratacoesOptions = {
  uf: string;
  /** Último dia de encerramento das propostas, no formato AAAAMMDD. */
  dataFinal: string;
  maxPages: number;
  pageSize?: number;
  /** Pausa entre páginas, para respeitar o limite da API. */
  delayMs?: number;
  /** Esperas antes de cada nova tentativa após 429/5xx/erro de rede. */
  retryDelaysMs?: number[];
  /** Instante (epoch ms) a partir do qual não se inicia uma nova página. */
  stopAt?: number;
  /** Tempo máximo de espera por resposta de uma página. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
};

export type FetchOpenContratacoesResult = {
  items: PncpContratacao[];
  pagesFetched: number;
  /** true quando todas as páginas foram lidas. */
  complete: boolean;
  /** Falha que interrompeu a leitura depois de já haver páginas lidas. */
  error?: string;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchOpenContratacoes({
  uf,
  dataFinal,
  maxPages,
  pageSize = 50,
  delayMs = 1500,
  retryDelaysMs = [5_000, 15_000, 30_000],
  stopAt = Number.POSITIVE_INFINITY,
  timeoutMs = 30_000,
  fetchImpl = fetch,
  sleep = defaultSleep,
  userAgent = "peneir.IA/0.1",
}: FetchOpenContratacoesOptions): Promise<FetchOpenContratacoesResult> {
  const items: PncpContratacao[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    if (page > 1) {
      if (Date.now() + delayMs >= stopAt) {
        return { items, pagesFetched: page - 1, complete: false };
      }
      await sleep(delayMs);
    }

    const url = new URL(`${pncpConsultaBaseUrl}/v1/contratacoes/proposta`);
    url.searchParams.set("dataFinal", dataFinal);
    url.searchParams.set("uf", uf);
    url.searchParams.set("pagina", String(page));
    url.searchParams.set("tamanhoPagina", String(pageSize));

    let body: PncpPage | null;
    try {
      body = await requestPage(url, {
        fetchImpl,
        sleep,
        retryDelaysMs,
        stopAt,
        timeoutMs,
        userAgent,
      });
    } catch (error) {
      // Sem nenhuma página lida, a falha é total; senão, aproveita o que já veio.
      if (page === 1) throw error;
      return {
        items,
        pagesFetched: page - 1,
        complete: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const data = body?.data ?? [];
    items.push(...data);

    const remaining =
      body?.paginasRestantes ??
      (body?.totalPaginas !== undefined ? body.totalPaginas - page : 0);
    if (data.length === 0 || remaining <= 0) {
      return { items, pagesFetched: page, complete: true };
    }
  }

  return { items, pagesFetched: maxPages, complete: false };
}

async function requestPage(
  url: URL,
  {
    fetchImpl,
    sleep,
    retryDelaysMs,
    stopAt,
    timeoutMs,
    userAgent,
  }: {
    fetchImpl: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    retryDelaysMs: number[];
    stopAt: number;
    timeoutMs: number;
    userAgent: string;
  },
): Promise<PncpPage | null> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response | undefined;
    let failure: PncpRequestError;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: "application/json", "User-Agent": userAgent },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      response = undefined;
    }

    if (response?.status === 204) return null;
    if (response?.ok) {
      try {
        return (await response.json()) as PncpPage;
      } catch {
        throw new PncpRequestError("Resposta inválida do PNCP.", response.status);
      }
    }

    if (!response) {
      failure = new PncpRequestError("Falha de rede ao consultar o PNCP.");
    } else {
      failure = new PncpRequestError(
        `PNCP respondeu com HTTP ${response.status}.`,
        response.status,
      );
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) throw failure;
    }

    const wait = retryDelaysMs[attempt];
    if (wait === undefined || Date.now() + wait >= stopAt) throw failure;
    await sleep(wait);
  }
}

/** Data no fuso de Brasília deslocada em `daysAhead` dias, no formato AAAAMMDD. */
export function pncpDateParam(daysAhead: number, now = new Date()) {
  const target = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(target)
    .replaceAll("-", "");
}

/**
 * Arquivos publicados de uma contratação no PNCP (edital, termo de referência,
 * anexos). API: GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos
 */

const pncpApiBaseUrl = "https://pncp.gov.br/api/pncp/v1";

export type PncpFile = {
  titulo: string;
  tipo: string;
  url: string;
  publishedAt: string;
};

export type PncpPurchaseKey = { cnpj: string; ano: number; sequencial: number };

/**
 * Converte o id interno ("pncp:08761140000194-1-000040/2025", montado a partir
 * do numeroControlePNCP) na chave da compra.
 */
export function parsePncpOpportunityId(id: string): PncpPurchaseKey | null {
  const match = /^pncp:(\d{14})-\d+-(\d+)\/(\d{4})$/.exec(id);
  if (!match) return null;
  return { cnpj: match[1], sequencial: Number(match[2]), ano: Number(match[3]) };
}

/** Tipos com mais chance de trazer requisitos de habilitação vêm primeiro. */
const typePriority = [
  "edital",
  "aviso de contratação direta",
  "termo de referência",
  "ato que autoriza a contratação direta",
  "projeto básico",
  "estudo técnico preliminar",
];

function priorityOf(file: PncpFile) {
  const type = file.tipo.toLocaleLowerCase("pt-BR");
  const index = typePriority.indexOf(type);
  return index === -1 ? typePriority.length : index;
}

/** Ordena por tipo e, no mesmo tipo, do mais recente (retificações) ao mais antigo. */
export function sortPncpFiles(files: PncpFile[]) {
  return [...files].sort(
    (left, right) =>
      priorityOf(left) - priorityOf(right) ||
      right.publishedAt.localeCompare(left.publishedAt),
  );
}

/** Só baixa de endereços do próprio PNCP (os links vêm da resposta da API). */
export function isPncpUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "pncp.gov.br" || url.hostname.endsWith(".pncp.gov.br"))
    );
  } catch {
    return false;
  }
}

type RequestOptions = {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
};

export async function listPncpFiles(
  { cnpj, ano, sequencial }: PncpPurchaseKey,
  { fetchImpl = fetch, userAgent = "peneir.IA/0.1", timeoutMs = 20_000 }: RequestOptions = {},
): Promise<PncpFile[]> {
  const response = await fetchImpl(
    `${pncpApiBaseUrl}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`,
    {
      headers: { Accept: "application/json", "User-Agent": userAgent },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (response.status === 204 || response.status === 404) return [];
  if (!response.ok) throw new Error(`PNCP respondeu com HTTP ${response.status} ao listar arquivos.`);

  const body: unknown = await response.json();
  if (!Array.isArray(body)) return [];
  const files: PncpFile[] = [];
  for (const item of body) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : record.uri;
    if (record.statusAtivo === false || typeof url !== "string" || !isPncpUrl(url)) continue;
    files.push({
      titulo: typeof record.titulo === "string" ? record.titulo : "Arquivo",
      tipo: typeof record.tipoDocumentoNome === "string" ? record.tipoDocumentoNome : "",
      url,
      publishedAt:
        typeof record.dataPublicacaoPncp === "string" ? record.dataPublicacaoPncp : "",
    });
  }
  return sortPncpFiles(files);
}

export class FileTooLargeError extends Error {}

/**
 * Baixa um arquivo do PNCP interrompendo a transferência se passar de
 * `maxBytes`. Devolve também o nome informado em Content-Disposition.
 */
export async function downloadPncpFile(
  url: string,
  maxBytes: number,
  { fetchImpl = fetch, userAgent = "peneir.IA/0.1", timeoutMs = 60_000 }: RequestOptions = {},
) {
  if (!isPncpUrl(url)) throw new Error("Endereço de arquivo fora do PNCP.");
  const response = await fetchImpl(url, {
    headers: { "User-Agent": userAgent },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.url && !isPncpUrl(response.url)) {
    throw new Error("O PNCP redirecionou o download para fora do portal.");
  }
  if (!response.ok || !response.body) {
    throw new Error(`PNCP respondeu com HTTP ${response.status} ao baixar o arquivo.`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body.cancel();
    throw new FileTooLargeError("Arquivo maior que o limite de leitura.");
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new FileTooLargeError("Arquivo maior que o limite de leitura.");
    }
    chunks.push(value);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const name =
    /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ??
    /filename="?([^";]+)"?/i.exec(disposition)?.[1] ??
    "arquivo";
  let decodedName = name;
  try {
    decodedName = decodeURIComponent(name.replace(/\+/g, " "));
  } catch {
    // Mantém o nome como veio.
  }
  return { bytes: Buffer.concat(chunks), name: decodedName };
}

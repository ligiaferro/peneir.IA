import { describe, expect, it, vi } from "vitest";
import {
  fetchOpenContratacoes,
  genericBiddingRequirements,
  mapPncpContratacao,
  parsePncpDateTime,
  pncpDateParam,
  PncpRequestError,
  type PncpContratacao,
} from "./pncp";

// Registro real da API de consulta do PNCP (campos não usados omitidos).
const sample: PncpContratacao = {
  numeroControlePNCP: "08761140000194-1-000040/2025",
  anoCompra: 2025,
  sequencialCompra: 40,
  objetoCompra:
    "REGISTRO DE PREÇOS PARA AQUISIÇÃO DE EQUIPAMENTOS DE SEGURANÇA",
  informacaoComplementar: "EQUIPAMENTOS DE SEGURANÇA PARA GAR",
  modalidadeNome: "Pregão - Eletrônico",
  situacaoCompraId: 1,
  srp: true,
  valorTotalEstimado: 9732643.43,
  dataPublicacaoPncp: "2025-03-13T14:10:37",
  dataEncerramentoProposta: "2026-11-09T23:59:59",
  orgaoEntidade: {
    cnpj: "08761140000194",
    razaoSocial: "SECRETARIA DE ESTADO DA ADMINISTRACAO",
  },
  unidadeOrgao: {
    ufSigla: "PB",
    municipioNome: "João Pessoa",
    nomeUnidade: "SECRETARIA DE ESTADO DA ADMINISTRACAO",
  },
  amparoLegal: { nome: "Lei 14.133/2021, Art. 28, I" },
};

describe("parsePncpDateTime", () => {
  it("interprets PNCP timestamps as Brasília time", () => {
    expect(parsePncpDateTime("2026-11-09T23:59:59")).toBe(
      "2026-11-10T02:59:59.000Z",
    );
  });

  it("rejects missing or malformed values", () => {
    expect(parsePncpDateTime(null)).toBeNull();
    expect(parsePncpDateTime("09/11/2026")).toBeNull();
    expect(parsePncpDateTime("2026-11-09T23:59:59Z")).toBeNull();
  });
});

describe("mapPncpContratacao", () => {
  it("maps a PNCP purchase to an opportunity", () => {
    const record = mapPncpContratacao(sample, "2026-11-07T10:00:00.000Z");
    expect(record).toMatchObject({
      id: "pncp:08761140000194-1-000040/2025",
      externalId: "08761140000194-1-000040/2025",
      source: "pncp",
      region: "PB",
      category: "licitacoes",
      title: "REGISTRO DE PREÇOS PARA AQUISIÇÃO DE EQUIPAMENTOS DE SEGURANÇA",
      organization: "SECRETARIA DE ESTADO DA ADMINISTRACAO",
      location: "João Pessoa, PB",
      deadline: "2026-11-10T02:59:59.000Z",
      publishedAt: "2025-03-13T17:10:37.000Z",
      firstSeenAt: "2026-11-07T10:00:00.000Z",
      requirements: genericBiddingRequirements,
      requirementsAreGeneric: true,
      sourceUrl: "https://pncp.gov.br/app/editais/08761140000194/2025/40",
    });
    expect(record?.summary).toContain("EQUIPAMENTOS DE SEGURANÇA PARA GAR");
    expect(record?.summary).toMatch(/Valor estimado: R\$\s9\.732\.643,43/);
    expect(record?.summary).not.toContain("Unidade:");
    expect(record?.tags).toEqual([
      "pregão - eletrônico",
      "registro de preços",
      "lei 14.133/2021, art. 28, i",
    ]);
  });

  it("truncates long titles but keeps the full object in the summary", () => {
    const objetoCompra = "A".repeat(400);
    const record = mapPncpContratacao({ ...sample, objetoCompra });
    expect(record?.title).toHaveLength(160);
    expect(record?.title.endsWith("…")).toBe(true);
    expect(record?.summary).toContain(objetoCompra);
  });

  it("skips purchases that are not published or lack required data", () => {
    expect(mapPncpContratacao({ ...sample, situacaoCompraId: 2 })).toBeNull();
    expect(
      mapPncpContratacao({ ...sample, dataEncerramentoProposta: null }),
    ).toBeNull();
    expect(mapPncpContratacao({ ...sample, objetoCompra: "  " })).toBeNull();
    expect(
      mapPncpContratacao({
        ...sample,
        orgaoEntidade: { cnpj: "javascript:alert(1)", razaoSocial: "X" },
      }),
    ).toBeNull();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function page(numero: number, total: number, items: PncpContratacao[]) {
  return {
    data: items,
    totalPaginas: total,
    numeroPagina: numero,
    paginasRestantes: total - numero,
  };
}

describe("fetchOpenContratacoes", () => {
  const sleep = vi.fn(async () => {});

  it("reads every page and sends the expected query", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(page(1, 2, [sample])))
      .mockResolvedValueOnce(jsonResponse(page(2, 2, [sample])));

    const result = await fetchOpenContratacoes({
      uf: "PE",
      dataFinal: "20270106",
      maxPages: 10,
      fetchImpl,
      sleep,
    });

    expect(result).toMatchObject({ pagesFetched: 2, complete: true });
    expect(result.items).toHaveLength(2);
    const firstUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(firstUrl.pathname).toBe("/api/consulta/v1/contratacoes/proposta");
    expect(Object.fromEntries(firstUrl.searchParams)).toEqual({
      dataFinal: "20270106",
      uf: "PE",
      pagina: "1",
      tamanhoPagina: "50",
    });
  });

  it("treats 204 No Content as an empty, complete listing", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const result = await fetchOpenContratacoes({
      uf: "AC",
      dataFinal: "20270106",
      maxPages: 10,
      fetchImpl,
      sleep,
    });
    expect(result).toEqual({ items: [], pagesFetched: 1, complete: true });
  });

  it("retries after a 429 rate limit", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("<html>limite</html>", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(page(1, 1, [sample])));
    const result = await fetchOpenContratacoes({
      uf: "PE",
      dataFinal: "20270106",
      maxPages: 10,
      retryDelaysMs: [10],
      fetchImpl,
      sleep,
    });
    expect(result.complete).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws when the first page keeps failing", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("", { status: 503 }));
    await expect(
      fetchOpenContratacoes({
        uf: "PE",
        dataFinal: "20270106",
        maxPages: 10,
        retryDelaysMs: [1, 1],
        fetchImpl,
        sleep,
      }),
    ).rejects.toBeInstanceOf(PncpRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: "inválido" }, 400));
    await expect(
      fetchOpenContratacoes({
        uf: "PE",
        dataFinal: "x",
        maxPages: 10,
        fetchImpl,
        sleep,
      }),
    ).rejects.toThrow("HTTP 400");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps pages already read when a later page fails", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(page(1, 3, [sample])))
      .mockResolvedValue(new Response("", { status: 500 }));
    const result = await fetchOpenContratacoes({
      uf: "PE",
      dataFinal: "20270106",
      maxPages: 10,
      retryDelaysMs: [],
      fetchImpl,
      sleep,
    });
    expect(result).toMatchObject({ pagesFetched: 1, complete: false });
    expect(result.items).toHaveLength(1);
    expect(result.error).toContain("HTTP 500");
  });

  it("reports an incomplete listing when the page limit is reached", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse(page(1, 5, [sample])));
    const result = await fetchOpenContratacoes({
      uf: "PE",
      dataFinal: "20270106",
      maxPages: 2,
      fetchImpl,
      sleep,
    });
    expect(result).toMatchObject({ pagesFetched: 2, complete: false });
  });

  it("stops before the time budget runs out", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse(page(1, 5, [sample])));
    const result = await fetchOpenContratacoes({
      uf: "PE",
      dataFinal: "20270106",
      maxPages: 10,
      delayMs: 1000,
      stopAt: Date.now() + 500,
      fetchImpl,
      sleep,
    });
    expect(result).toMatchObject({ pagesFetched: 1, complete: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("pncpDateParam", () => {
  it("formats the target date in Brasília time", () => {
    // 01:00 UTC ainda é o dia anterior em Brasília.
    expect(pncpDateParam(0, new Date("2026-11-08T01:00:00.000Z"))).toBe(
      "20261107",
    );
    expect(pncpDateParam(60, new Date("2026-11-07T15:00:00.000Z"))).toBe(
      "20270106",
    );
  });
});

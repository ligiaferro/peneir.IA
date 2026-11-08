import { describe, expect, it, vi } from "vitest";
import {
  buildProfileDraft,
  CompanyLookupError,
  fetchCompanyByCnpj,
  parseCompanyRecord,
  refineProfileDraft,
} from "./company-lookup";

const apiResponse = {
  cnpj: "00000000000191",
  razao_social: "BANCO DO BRASIL SA",
  nome_fantasia: "DIRECAO GERAL",
  uf: "DF",
  municipio: "BRASILIA",
  codigo_porte: 5,
  situacao_cadastral: 2,
  cnae_fiscal: 6422100,
  cnae_fiscal_descricao: "Bancos múltiplos, com carteira comercial",
  cnaes_secundarios: [
    { codigo: 6499999, descricao: "Outras atividades de serviços financeiros" },
    { codigo: 0, descricao: "Não informada" },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("parseCompanyRecord", () => {
  it("converte a resposta da BrasilAPI", () => {
    const company = parseCompanyRecord(apiResponse);
    expect(company).toMatchObject({
      cnpj: "00000000000191",
      legalName: "Banco do Brasil SA",
      uf: "DF",
      size: "DEMAIS",
      active: true,
    });
    expect(company.mainActivity?.description).toBe("Bancos múltiplos, com carteira comercial");
    expect(company.secondaryActivities).toHaveLength(1);
  });

  it("rejeita resposta sem razão social", () => {
    expect(() => parseCompanyRecord({ cnpj: "00000000000191" })).toThrow(CompanyLookupError);
  });
});

describe("buildProfileDraft", () => {
  it("monta nome, descrição, palavras-chave e estado", () => {
    const draft = buildProfileDraft(parseCompanyRecord(apiResponse));
    expect(draft.states).toEqual(["DF"]);
    expect(draft.keywords).toEqual(["bancos múltiplos", "outras atividades de serviços financeiros"]);
    expect(draft.productsServices).toContain("Atividade principal: Bancos múltiplos");
    expect(draft.productsServices).toContain("Atividades secundárias:");
  });
});

describe("fetchCompanyByCnpj", () => {
  it("consulta a API com o CNPJ só em dígitos", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(apiResponse));
    await fetchCompanyByCnpj("00.000.000/0001-91", fetchImpl as never);
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/\/00000000000191$/);
  });

  it("não consulta CNPJ inválido", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchCompanyByCnpj("00.000.000/0001-92", fetchImpl as never)).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("distingue não encontrado de indisponível", async () => {
    await expect(
      fetchCompanyByCnpj("00000000000191", vi.fn().mockResolvedValue(json({}, 404)) as never),
    ).rejects.toMatchObject({ kind: "not_found" });
    await expect(
      fetchCompanyByCnpj("00000000000191", vi.fn().mockResolvedValue(json({}, 503)) as never),
    ).rejects.toMatchObject({ kind: "unavailable" });
    await expect(
      fetchCompanyByCnpj("00000000000191", vi.fn().mockRejectedValue(new Error("rede")) as never),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("refineProfileDraft", () => {
  const company = parseCompanyRecord(apiResponse);
  const draft = buildProfileDraft(company);

  it("usa a resposta da IA quando válida", async () => {
    const refined = await refineProfileDraft(company, draft, {
      createCompletion: async () =>
        JSON.stringify({ produtosServicos: "Serviços financeiros.", palavrasChave: ["banco", "crédito", "x"] }),
    });
    expect(refined.productsServices).toBe("Serviços financeiros.");
    expect(refined.keywords).toEqual(["banco", "crédito"]);
    expect(refined.states).toEqual(draft.states);
  });

  it("volta ao rascunho se a IA falhar ou responder lixo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await refineProfileDraft(company, draft, { createCompletion: async () => "não é json" }),
    ).toEqual(draft);
    expect(
      await refineProfileDraft(company, draft, {
        createCompletion: async () => {
          throw new Error("falhou");
        },
      }),
    ).toEqual(draft);
  });
});

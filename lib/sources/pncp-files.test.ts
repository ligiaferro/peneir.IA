import { describe, expect, it } from "vitest";
import {
  downloadPncpFile,
  FileTooLargeError,
  isPncpUrl,
  listPncpFiles,
  parsePncpOpportunityId,
  sortPncpFiles,
} from "./pncp-files";

describe("parsePncpOpportunityId", () => {
  it("extracts cnpj, year and sequence", () => {
    expect(parsePncpOpportunityId("pncp:08761140000194-1-000040/2025")).toEqual({
      cnpj: "08761140000194",
      ano: 2025,
      sequencial: 40,
    });
    expect(parsePncpOpportunityId("mock-1")).toBeNull();
    expect(parsePncpOpportunityId("pncp:123-1-1/2025")).toBeNull();
  });
});

describe("isPncpUrl", () => {
  it("only accepts https URLs on the PNCP domain", () => {
    expect(isPncpUrl("https://pncp.gov.br/pncp-api/v1/orgaos/1/arquivos/2")).toBe(true);
    expect(isPncpUrl("https://arquivos.pncp.gov.br/x.pdf")).toBe(true);
    expect(isPncpUrl("http://pncp.gov.br/x")).toBe(false);
    expect(isPncpUrl("https://pncp.gov.br.evil.com/x")).toBe(false);
    expect(isPncpUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isPncpUrl("nada")).toBe(false);
  });
});

describe("sortPncpFiles", () => {
  it("puts the edital first and the latest version before older ones", () => {
    const sorted = sortPncpFiles([
      { titulo: "Anexo", tipo: "Outros Documentos", url: "a", publishedAt: "2025-01-03" },
      { titulo: "TR", tipo: "Termo de Referência", url: "b", publishedAt: "2025-01-01" },
      { titulo: "Edital", tipo: "Edital", url: "c", publishedAt: "2025-01-01" },
      { titulo: "Edital retificado", tipo: "Edital", url: "d", publishedAt: "2025-01-05" },
    ]);
    expect(sorted.map((file) => file.url)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("listPncpFiles", () => {
  it("keeps active files on the PNCP domain", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify([
          { titulo: "Edital", tipoDocumentoNome: "Edital", url: "https://pncp.gov.br/a/1", statusAtivo: true, dataPublicacaoPncp: "2025-06-17T12:00:00" },
          { titulo: "Antigo", tipoDocumentoNome: "Edital", url: "https://pncp.gov.br/a/2", statusAtivo: false },
          { titulo: "Externo", tipoDocumentoNome: "Edital", url: "https://example.com/x.pdf", statusAtivo: true },
        ]),
        { status: 200 },
      )) as unknown as typeof fetch;
    const files = await listPncpFiles({ cnpj: "08761140000194", ano: 2025, sequencial: 40 }, { fetchImpl });
    expect(files).toEqual([
      { titulo: "Edital", tipo: "Edital", url: "https://pncp.gov.br/a/1", publishedAt: "2025-06-17T12:00:00" },
    ]);
  });
});

describe("downloadPncpFile", () => {
  const respond = (body: string, headers: Record<string, string> = {}) =>
    (async () => new Response(body, { status: 200, headers })) as unknown as typeof fetch;

  it("returns the bytes and the file name", async () => {
    const result = await downloadPncpFile("https://pncp.gov.br/f/1", 1_000, {
      fetchImpl: respond("%PDF-conteudo", { "content-disposition": 'attachment; filename="Edital+Final.pdf"' }),
    });
    expect(result.bytes.toString()).toBe("%PDF-conteudo");
    expect(result.name).toBe("Edital Final.pdf");
  });

  it("stops when the file exceeds the limit", async () => {
    await expect(
      downloadPncpFile("https://pncp.gov.br/f/1", 10, { fetchImpl: respond("x".repeat(50)) }),
    ).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it("refuses URLs outside the PNCP", async () => {
    await expect(
      downloadPncpFile("https://example.com/f.pdf", 10, { fetchImpl: respond("x") }),
    ).rejects.toThrow(/fora do PNCP/);
  });
});

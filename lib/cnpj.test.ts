import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "./cnpj";

describe("cnpj", () => {
  it("normaliza e formata", () => {
    expect(normalizeCnpj("00.000.000/0001-91")).toBe("00000000000191");
    expect(normalizeCnpj("123")).toBe("");
    expect(formatCnpj("00000000000191")).toBe("00.000.000/0001-91");
  });

  it("valida os dígitos verificadores", () => {
    expect(isValidCnpj("00.000.000/0001-91")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("00.000.000/0001-92")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });
});

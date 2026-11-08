import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAppUrl,
  getChatModel,
  getConfiguredStates,
  getEditalModel,
  getUserAgent,
  readPositiveInteger,
} from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("config", () => {
  it("remove a barra final da URL do app", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000/");
    expect(getAppUrl()).toBe("http://localhost:3000");
    expect(getUserAgent()).toContain("http://localhost:3000");
  });

  it("sem PNCP_UFS não há UF fixa", () => {
    vi.stubEnv("PNCP_UFS", "");
    expect(getConfiguredStates()).toEqual({ states: [], invalid: [] });
    vi.stubEnv("PNCP_UFS", "pe, sp, zz");
    expect(getConfiguredStates()).toEqual({ states: ["PE", "SP"], invalid: ["ZZ"] });
  });

  it("o modelo de edital cai para o da análise", () => {
    vi.stubEnv("OPENAI_MODEL", "modelo-a");
    vi.stubEnv("OPENAI_EDITAL_MODEL", "");
    expect(getChatModel()).toBe("modelo-a");
    expect(getEditalModel()).toBe("modelo-a");
    vi.stubEnv("OPENAI_EDITAL_MODEL", "modelo-b");
    expect(getEditalModel()).toBe("modelo-b");
  });

  it("limita inteiros positivos", () => {
    expect(readPositiveInteger("500", 3, 6)).toBe(6);
    expect(readPositiveInteger("x", 3, 6)).toBe(3);
    expect(readPositiveInteger("0", 3, 6)).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { hasStaleProfileEmbedding } from "./profile-embedding";

describe("hasStaleProfileEmbedding", () => {
  it("flags only profiles embedded with another model", () => {
    expect(hasStaleProfileEmbedding({ embedding_model: "modelo-antigo" }, "modelo-novo")).toBe(true);
    expect(hasStaleProfileEmbedding({ embedding_model: "modelo-novo" }, "modelo-novo")).toBe(false);
    // Sem vetor ainda: não é "antigo", o perfil só precisa ser preenchido.
    expect(hasStaleProfileEmbedding({ embedding_model: null }, "modelo-novo")).toBe(false);
  });
});

import { FakeListChatModel } from "@langchain/core/utils/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const modelResponses: string[] = [];
const prompts: string[] = [];

vi.mock("@/lib/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("./llm")>();
  return {
    ...original,
    createChatModel: () => {
      const model = new FakeListChatModel({ responses: [...modelResponses] });
      const invoke = model.invoke.bind(model);
      model.invoke = async (input, options) => {
        prompts.push(JSON.stringify(input));
        return invoke(input, options);
      };
      return model;
    },
  };
});

const { generateDocumentType } = await import("./document-report-ai");

beforeEach(() => {
  modelResponses.length = 0;
  prompts.length = 0;
});

describe("generateDocumentType", () => {
  it("uses the PDF text and filename to return a validated type", async () => {
    modelResponses.push('```json\n{"tipo":"Certidão negativa de débitos trabalhistas"}\n```');

    await expect(
      generateDocumentType("certidao.pdf", "CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS"),
    ).resolves.toBe("Certidão negativa de débitos trabalhistas");

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("certidao.pdf");
    expect(prompts[0]).toContain("CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS");
  });

  it("rejects a response without a document type", async () => {
    modelResponses.push('{"tipo":""}');

    await expect(generateDocumentType("arquivo.pdf", "")).rejects.toThrow(
      "A IA não devolveu um tipo de documento válido.",
    );
  });
});

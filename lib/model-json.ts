/**
 * Leitura do JSON devolvido pelos modelos. Sem dependências de servidor.
 *
 * Alguns modelos (inclusive via APIs compatíveis com OpenAI) cercam o JSON com
 * Markdown ou o precedem com um bloco de raciocínio; aqui aceitamos esses
 * formatos e devolvemos só o objeto.
 */
export function parseModelJson(value: string): Record<string, unknown> {
  const withoutReasoning = value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const unfenced = withoutReasoning
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    // Texto antes ou depois do objeto: tenta o trecho entre a primeira "{" e a última "}".
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("A IA não devolveu um objeto JSON.");
    }
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("A IA devolveu um JSON que não é um objeto.");
  }
  return parsed as Record<string, unknown>;
}

/** Texto de uma linha, sem espaços repetidos, com limite de tamanho. */
export function cleanModelString(value: unknown, maxLength = 600) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

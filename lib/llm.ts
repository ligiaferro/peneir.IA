import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, type RunnableSequence } from "@langchain/core/runnables";
import { SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { getChatModel } from "@/lib/config";

/**
 * Camada de IA generativa com LangChain. Usa uma API compatível com OpenAI
 * (OPENAI_API_KEY e, opcionalmente, OPENAI_BASE_URL).
 *
 * As chains pedem JSON no prompt e validam a resposta no servidor, sem depender
 * de function calling ou `response_format`, que nem todo provedor compatível
 * implementa.
 */

export function isChatModelConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function createChatModel({
  model = getChatModel(),
  timeoutMs,
  maxRetries = 2,
}: {
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
} = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  return new ChatOpenAI({
    apiKey,
    model,
    maxRetries,
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}

/**
 * Chain "instruções fixas + texto → modelo → texto". O prompt de sistema entra
 * como mensagem pronta (não como template), então chaves `{}` de exemplos de
 * JSON não são interpretadas como variáveis.
 */
export function createTextChain({
  system,
  model,
}: {
  system: string;
  model: ChatOpenAI;
}): RunnableSequence<string, string> {
  const prompt = ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ["human", "{input}"],
  ]);
  return RunnableLambda.from((input: string) => ({ input }))
    .pipe(prompt)
    .pipe(model)
    .pipe(new StringOutputParser()) as RunnableSequence<string, string>;
}

/**
 * Chain "instruções fixas + dados em JSON → modelo → texto → objeto validado".
 *
 * O prompt de sistema entra como mensagem pronta (não como template), então
 * chaves `{}` de exemplos de JSON não são interpretadas como variáveis.
 */
export function createJsonChain<TInput, TOutput>({
  system,
  model,
  parse,
}: {
  system: string;
  model: ChatOpenAI;
  parse: (text: string) => TOutput;
}): RunnableSequence<TInput, TOutput> {
  return RunnableLambda.from((input: TInput) => JSON.stringify(input))
    .pipe(createTextChain({ system, model }))
    .pipe(
      RunnableLambda.from((text: string) => {
        if (!text.trim()) throw new Error("A IA não devolveu uma resposta.");
        return parse(text);
      }),
    ) as RunnableSequence<TInput, TOutput>;
}

/**
 * Seleciona o trecho do edital enviado à IA. Editais curtos vão inteiros;
 * nos longos, mantém o início (objeto, datas, critério de julgamento) e os
 * blocos com mais termos ligados a habilitação e condições de participação.
 */

const chunkSize = 2_000;
const headLength = 24_000;

const keywords = [
  "habilitação",
  "habilitacao",
  "qualificação técnica",
  "qualificação econômico",
  "econômico-financeira",
  "regularidade fiscal",
  "regularidade trabalhista",
  "certidão",
  "certidao",
  "atestado",
  "balanço patrimonial",
  "declaração",
  "garantia",
  "visita técnica",
  "vistoria",
  "amostra",
  "prova de conceito",
  "consórcio",
  "microempresa",
  "me/epp",
  "critério de julgamento",
  "modo de disputa",
  "prazo de entrega",
  "local de entrega",
  "vigência",
  "pagamento",
  "sessão pública",
  "documentos",
];

function scoreChunk(chunk: string) {
  const lower = chunk.toLocaleLowerCase("pt-BR");
  let score = 0;
  for (const keyword of keywords) {
    let index = lower.indexOf(keyword);
    while (index !== -1) {
      score += 1;
      index = lower.indexOf(keyword, index + keyword.length);
    }
  }
  return score;
}

export function selectEditalExcerpt(text: string, budget = 150_000) {
  if (text.length <= budget) return text;

  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += chunkSize) {
    chunks.push(text.slice(start, start + chunkSize));
  }

  const headChunks = Math.min(chunks.length, Math.ceil(Math.min(headLength, budget) / chunkSize));
  const selected = new Set<number>(Array.from({ length: headChunks }, (_, index) => index));
  let used = headChunks * chunkSize;

  const ranked = chunks
    .map((chunk, index) => ({ index, score: scoreChunk(chunk) }))
    .filter(({ index, score }) => index >= headChunks && score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  for (const { index } of ranked) {
    if (used + chunkSize > budget) break;
    selected.add(index);
    used += chunkSize;
  }

  let excerpt = "";
  let previous = -1;
  for (const index of [...selected].sort((left, right) => left - right)) {
    if (previous !== -1 && index !== previous + 1) excerpt += "\n[...]\n";
    excerpt += chunks[index];
    previous = index;
  }
  return excerpt;
}

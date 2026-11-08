import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export function isPdf(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

/**
 * Extrai o texto selecionável de um PDF. PDFs digitalizados como imagem
 * devolvem texto vazio (seria preciso OCR).
 */
export async function extractPdfText(
  bytes: Uint8Array,
  { maxPages = Number.POSITIVE_INFINITY, maxChars = Number.POSITIVE_INFINITY } = {},
) {
  const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const pages: string[] = [];
  let length = 0;
  const pageCount = Math.min(pdf.numPages, maxPages);

  try {
    for (let pageNumber = 1; pageNumber <= pageCount && length < maxChars; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      pages.push(text);
      length += text.length;
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return {
    text: pages.join("\n").replace(/\s+/g, " ").trim().slice(0, maxChars),
    pages: pdf.numPages,
    pagesRead: pages.length,
  };
}

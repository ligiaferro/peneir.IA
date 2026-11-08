import { describe, expect, it } from "vitest";
import { alertEmailHtml, alertEmailSubject, escapeHtml } from "./alert-email";
import type { Opportunity } from "./types";

const opportunity: Opportunity = {
  id: "pncp:1",
  source: "pncp",
  title: "Aquisição de <notebooks> & periféricos",
  organization: "Prefeitura do Recife",
  category: "licitacoes",
  location: "Recife, PE",
  uf: "PE",
  summary: "",
  tags: [],
  requirements: [],
  requirementsAreGeneric: true,
  deadline: "2026-12-03T13:00:00.000Z",
  publishedAt: "2026-11-06T12:00:00.000Z",
  firstSeenAt: "2026-11-07T10:00:00.000Z",
  sourceUrl: "https://pncp.gov.br/app/editais/1/2026/1",
};

describe("alert email", () => {
  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("uses different wording for the immediate demo send", () => {
    expect(alertEmailSubject([opportunity])).toMatch(/^Nova oportunidade:/);
    expect(alertEmailSubject([opportunity, opportunity], { demo: true })).toBe(
      "2 editais relevantes para você",
    );

    const html = alertEmailHtml("Ana", [opportunity], { demo: true });
    expect(html).toContain("Editais relevantes para você");
    expect(html).toContain("envio imediato");
    expect(html).toContain("Aquisição de &lt;notebooks&gt; &amp; periféricos");
    expect(html).not.toContain("<notebooks>");
  });

  it("adds the unsubscribe link when provided", () => {
    const html = alertEmailHtml("Ana", [opportunity], {
      unsubscribeUrl: "https://app.exemplo.com/descadastro?u=1&t=x",
    });
    expect(html).toContain('href="https://app.exemplo.com/descadastro?u=1&amp;t=x"');
    expect(html).toContain("Não quero mais receber alertas");
    expect(alertEmailHtml("Ana", [opportunity])).not.toContain("Não quero mais receber");
  });
});

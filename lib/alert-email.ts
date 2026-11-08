import { formatDeadline } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

/** Itens listados no corpo do e-mail; o restante fica no painel. */
export const maxItemsPerEmail = 20;

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

type AlertEmailOptions = {
  /** Envio pedido pelo botão do painel: lista os editais relevantes, novos ou não. */
  demo?: boolean;
  /** Página que confirma o cancelamento dos alertas (link assinado). */
  unsubscribeUrl?: string | null;
};

export function alertEmailSubject(
  opportunities: Opportunity[],
  { demo = false }: AlertEmailOptions = {},
) {
  if (demo) {
    return opportunities.length === 1
      ? `Edital relevante para você: ${opportunities[0].title}`
      : `${opportunities.length} editais relevantes para você`;
  }
  return opportunities.length === 1
    ? `Nova oportunidade: ${opportunities[0].title}`
    : `${opportunities.length} novas oportunidades para você`;
}

export function alertEmailHtml(
  name: string,
  opportunities: Opportunity[],
  { demo = false, unsubscribeUrl = null }: AlertEmailOptions = {},
) {
  const listed = opportunities.slice(0, maxItemsPerEmail);
  const remaining = opportunities.length - listed.length;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/dashboard` : null;

  const items = listed
    .map(
      (opportunity) => `
        <li style="margin:0 0 20px">
          <strong>${escapeHtml(opportunity.title)}</strong><br>
          ${escapeHtml(opportunity.organization)} · ${escapeHtml(opportunity.location)}<br>
          Propostas/inscrições até ${escapeHtml(formatDeadline(opportunity.deadline))}<br>
          <a href="${escapeHtml(opportunity.sourceUrl)}">Consultar fonte</a>
        </li>`,
    )
    .join("");

  const count = opportunities.length;
  const heading = demo ? "Editais relevantes para você" : "Novas oportunidades para você";
  const intro = demo
    ? `Encontramos ${count} ${count === 1 ? "edital aberto" : "editais abertos"} que combinam com seu perfil`
    : `Encontramos ${count} ${count === 1 ? "oportunidade nova" : "oportunidades novas"} que combinam com seu perfil`;

  return `
    <div style="font-family:Arial,sans-serif;color:#172f2b;line-height:1.6;max-width:620px;margin:auto">
      <h1 style="color:#1b7159">${heading}</h1>
      <p>Olá, ${escapeHtml(name)}. ${intro}:</p>
      <ul>${items}</ul>
      ${
        remaining > 0
          ? `<p>E mais ${remaining} no seu painel${
              dashboardUrl
                ? `: <a href="${escapeHtml(dashboardUrl)}">abrir peneir.IA</a>`
                : "."
            }</p>`
          : ""
      }
      <p>Licitações são coletadas do Portal Nacional de Contratações Públicas (PNCP). Confirme sempre requisitos e prazos no edital oficial.</p>
      <p style="color:#64736e;font-size:12px">${
        demo
          ? "Este e-mail foi enviado porque você pediu um envio imediato no painel peneir.IA."
          : "Você recebe este e-mail porque ativou os alertas no seu perfil peneir.IA."
      }${
        unsubscribeUrl
          ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:#64736e">Não quero mais receber alertas</a>.`
          : ""
      }</p>
    </div>`;
}

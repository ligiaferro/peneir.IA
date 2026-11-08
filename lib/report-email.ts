/**
 * E-mail com o relatório de uma vaga: leitura do edital pela IA e status atual
 * dos documentos. HTML em tabelas com estilos inline, para renderizar bem em
 * Gmail, Outlook e Apple Mail. Sem dependências de servidor.
 */

import { escapeHtml } from "@/lib/alert-email";
import {
  documentFitLabels,
  documentReportNoteLabels,
  sortReportDocuments,
  type DocumentReport,
} from "@/lib/document-report";
import {
  editalFieldLabels,
  editalRequirementCategories,
  type EditalFieldKey,
  type EditalInsights,
} from "@/lib/edital-insights";
import { formatDate, formatDeadline } from "@/lib/format";
import type { DocumentLinkFit, Opportunity, UserDocumentOpportunityLink } from "@/lib/types";

export type RequirementEmailStatus = "atendido" | "parcial" | "enviado" | "vencido" | "pendente";

/** Por que o status dos documentos está incompleto, quando está. */
export type DocumentsState = "analisado" | "sem_documentos" | "sem_consentimento";

export type EmailDocument = {
  id: string;
  name: string;
  expires_at: string | null;
};

export type RequirementEmailRow = {
  requirement: string;
  category: string | null;
  detail: string | null;
  status: RequirementEmailStatus;
  documents: Array<{ name: string; addedByAi: boolean; expired: boolean }>;
  explanation: string | null;
};

export type ReportEmailInput = {
  name: string;
  opportunity: Pick<
    Opportunity,
    "id" | "title" | "organization" | "location" | "deadline" | "sourceUrl"
  >;
  insights: EditalInsights;
  requirements: string[];
  report: DocumentReport | null;
  links: UserDocumentOpportunityLink[];
  documents: EmailDocument[];
  documentsState: DocumentsState;
  appUrl: string | null;
  today?: string;
};

const colors = {
  ink: "#172f2b",
  muted: "#64736e",
  paper: "#f5f7f2",
  line: "#e2e8e1",
  green: "#1b7159",
  greenDark: "#145844",
  mint: "#e8f4eb",
  lime: "#d7ed76",
};

const statusStyles: Record<
  RequirementEmailStatus,
  { label: string; background: string; color: string; accent: string }
> = {
  atendido: { label: "Atendido", background: "#d9f3e3", color: "#176342", accent: "#1b7159" },
  parcial: { label: "Parcial", background: "#fff1d6", color: "#8a5a12", accent: "#e0a63a" },
  enviado: { label: "Enviado · a conferir", background: "#e6eefb", color: "#2f4f86", accent: "#6f8fd0" },
  vencido: { label: "Vencido", background: "#fbe4e2", color: "#9a3a33", accent: "#bd4b43" },
  pendente: { label: "Pendente", background: "#eef1ef", color: "#536861", accent: "#c9d3ce" },
};

const fitRank: Record<DocumentLinkFit, number> = { total: 2, parcial: 1 };

/**
 * Status de cada exigência a partir dos vínculos atuais (feitos pela pessoa ou
 * pela IA) e do encaixe avaliado pela IA para cada documento vinculado.
 */
export function buildRequirementRows({
  insights,
  requirements,
  report,
  links,
  documents,
  opportunityId,
  today = new Date().toISOString().slice(0, 10),
}: Pick<ReportEmailInput, "insights" | "requirements" | "report" | "links" | "documents"> & {
  opportunityId: string;
  today?: string;
}): RequirementEmailRow[] {
  const details = new Map(insights.requisitos.map((item) => [item.documento, item]));
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const reportFits = new Map<string, { fit: DocumentLinkFit; explanation: string }>();
  for (const item of report?.documents ?? []) {
    for (const match of item.matches) {
      reportFits.set(`${item.documentId}\u0000${match.requirement}`, match);
    }
  }

  return [...new Set(requirements)].map((requirement) => {
    const linked = links
      .filter((link) => link.opportunity_id === opportunityId && link.requirement === requirement)
      .flatMap((link) => {
        const document = documentsById.get(link.document_id);
        if (!document) return [];
        const expired = Boolean(document.expires_at && document.expires_at < today);
        const evaluated =
          link.added_by === "ai" && link.ai_fit
            ? { fit: link.ai_fit, explanation: link.ai_explanation ?? null }
            : reportFits.get(`${document.id}\u0000${requirement}`) ?? null;
        return [{ document, link, expired, evaluated }];
      });
    const valid = linked.filter((item) => !item.expired);
    const best = valid
      .filter((item) => item.evaluated)
      .sort((left, right) => fitRank[right.evaluated!.fit] - fitRank[left.evaluated!.fit])[0];

    let status: RequirementEmailStatus;
    if (best?.evaluated?.fit === "total") status = "atendido";
    else if (best?.evaluated?.fit === "parcial") status = "parcial";
    else if (valid.length > 0) status = "enviado";
    else if (linked.length > 0) status = "vencido";
    else status = "pendente";

    const detail = details.get(requirement);
    return {
      requirement,
      category: detail ? editalRequirementCategories[detail.categoria] : null,
      detail: detail?.detalhe ?? null,
      status,
      documents: linked.map((item) => ({
        name: item.document.name,
        addedByAi: item.link.added_by === "ai",
        expired: item.expired,
      })),
      explanation: best?.evaluated?.explanation ?? null,
    };
  });
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function pill(label: string, background: string, color: string) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${background};color:${color};font-size:11px;font-weight:700;line-height:18px;white-space:nowrap">${escapeHtml(label)}</span>`;
}

function sectionTitle(title: string) {
  return `<tr><td style="padding:28px 32px 10px"><p style="margin:0;color:${colors.green};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">${escapeHtml(title)}</p></td></tr>`;
}

function statTile(value: number, label: string, background: string, color: string) {
  return `<td width="33%" style="padding:0 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${background};border-radius:12px"><tr><td align="center" style="padding:14px 6px"><p style="margin:0;color:${color};font-size:26px;font-weight:800;line-height:30px">${value}</p><p style="margin:2px 0 0;color:${color};font-size:11px;font-weight:600">${escapeHtml(label)}</p></td></tr></table></td>`;
}

export function reportEmailSubject(input: Pick<ReportEmailInput, "opportunity">) {
  return `Relatório da vaga: ${truncate(input.opportunity.title, 110)}`;
}

export function buildReportEmail(input: ReportEmailInput) {
  const { opportunity, insights, report, documentsState } = input;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const rows = buildRequirementRows({ ...input, opportunityId: opportunity.id, today });
  const counts = {
    atendido: rows.filter((row) => row.status === "atendido").length,
    conferir: rows.filter((row) => row.status === "parcial" || row.status === "enviado").length,
    pendente: rows.filter((row) => row.status === "pendente" || row.status === "vencido").length,
  };
  const percent = rows.length > 0 ? Math.round((counts.atendido / rows.length) * 100) : 0;
  const appUrl = input.appUrl?.replace(/\/$/, "") ?? null;
  const opportunityUrl = appUrl
    ? `${appUrl}/oportunidade?id=${encodeURIComponent(opportunity.id)}`
    : opportunity.sourceUrl;
  const settingsUrl = appUrl ? `${appUrl}/conta` : null;
  const archiveUrl = appUrl ? `${appUrl}/empresa#documentos` : null;
  const deadline = formatDeadline(opportunity.deadline);
  const preheader =
    rows.length > 0
      ? `${counts.atendido} de ${rows.length} documentos atendidos · propostas até ${deadline}`
      : `Resumo do edital · propostas até ${deadline}`;

  const fields = (Object.keys(editalFieldLabels) as EditalFieldKey[]).filter(
    (key) => insights.campos[key],
  );
  const fieldRows: string[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const cells = fields.slice(index, index + 2).map(
      (key) =>
        `<td width="50%" valign="top" style="padding:0 6px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.paper};border-radius:10px"><tr><td style="padding:10px 12px"><p style="margin:0;color:${colors.muted};font-size:11px;font-weight:600">${escapeHtml(editalFieldLabels[key])}</p><p style="margin:3px 0 0;color:${colors.ink};font-size:13px;line-height:19px">${escapeHtml(truncate(insights.campos[key]!, 220))}</p></td></tr></table></td>`,
    );
    if (cells.length === 1) cells.push('<td width="50%" style="padding:0 6px 12px"></td>');
    fieldRows.push(`<tr>${cells.join("")}</tr>`);
  }

  const requirementItems = rows
    .map((row) => {
      const style = statusStyles[row.status];
      const documents =
        row.documents.length > 0
          ? row.documents
              .map(
                (document) =>
                  `${escapeHtml(document.name)}${document.addedByAi ? ` <span style="color:${colors.green};font-weight:700">· IA</span>` : ""}${document.expired ? ` <span style="color:#9a3a33;font-weight:700">· vencido</span>` : ""}`,
              )
              .join("<br>")
          : `<span style="color:${colors.muted}">Nenhum documento vinculado</span>`;
      return `<tr><td style="padding:0 32px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${colors.line};border-left:4px solid ${style.accent};border-radius:10px"><tr><td style="padding:12px 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="top" style="color:${colors.ink};font-size:14px;font-weight:700;line-height:20px;padding-right:10px">${escapeHtml(row.requirement)}${row.category ? `<br><span style="color:${colors.muted};font-size:11px;font-weight:500">${escapeHtml(row.category)}</span>` : ""}</td>
          <td valign="top" align="right" width="1">${pill(style.label, style.background, style.color)}</td>
        </tr></table>
        ${row.detail ? `<p style="margin:6px 0 0;color:${colors.muted};font-size:12px;line-height:18px">${escapeHtml(truncate(row.detail, 260))}</p>` : ""}
        <p style="margin:8px 0 0;color:${colors.ink};font-size:12px;line-height:18px">📎 ${documents}</p>
        ${row.explanation ? `<p style="margin:6px 0 0;color:#476058;font-size:12px;line-height:18px;font-style:italic">${escapeHtml(truncate(row.explanation, 320))}</p>` : ""}
      </td></tr></table></td></tr>`;
    })
    .join("");

  const reportDocuments = report ? sortReportDocuments(report.documents).slice(0, 30) : [];
  const fitColors = {
    total: statusStyles.atendido,
    parcial: statusStyles.parcial,
    nenhum: statusStyles.pendente,
  };
  const documentItems = reportDocuments
    .map((document) => {
      const style = fitColors[document.fit];
      const explanation = document.note
        ? documentReportNoteLabels[document.note]
        : document.explanation;
      return `<tr><td style="padding:10px 0;border-top:1px solid ${colors.line}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="top" style="color:${colors.ink};font-size:13px;font-weight:700;line-height:19px;padding-right:10px">${escapeHtml(document.name)}<br><span style="color:${colors.muted};font-size:11px;font-weight:500">${escapeHtml(document.documentType)}</span></td>
          <td valign="top" align="right" width="1">${pill(documentFitLabels[document.fit], style.background, style.color)}</td>
        </tr></table>
        <p style="margin:4px 0 0;color:#476058;font-size:12px;line-height:18px">${escapeHtml(truncate(explanation, 260))}</p>
      </td></tr>`;
    })
    .join("");

  const stateNotice =
    documentsState === "sem_documentos"
      ? `Seu arquivo ainda não tem documentos. Envie os documentos da empresa${archiveUrl ? ` no <a href="${escapeHtml(archiveUrl)}" style="color:${colors.green};font-weight:700">arquivo da empresa</a>` : ""} e a IA indica quais atendem a cada exigência.`
      : documentsState === "sem_consentimento"
        ? `Para a IA comparar seus documentos com estas exigências, autorize a análise por IA na página da vaga${settingsUrl ? ` ou em <a href="${escapeHtml(settingsUrl)}" style="color:${colors.green};font-weight:700">Conta</a>` : ""}.`
        : null;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(reportEmailSubject(input))}</title>
</head>
<body style="margin:0;padding:0;background:${colors.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${colors.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.paper}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${colors.line}">

<tr><td style="background:${colors.ink};padding:22px 32px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="color:#ffffff;font-size:17px;font-weight:800"><span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:${colors.lime};color:${colors.ink};font-size:14px;margin-right:8px">p.</span>peneir.IA</td>
    <td align="right" style="color:${colors.lime};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Relatório da vaga</td>
  </tr></table>
</td></tr>

<tr><td style="padding:28px 32px 6px">
  <p style="margin:0 0 6px;color:${colors.muted};font-size:13px">Olá, ${escapeHtml(input.name)}. A IA terminou de analisar esta vaga:</p>
  <h1 style="margin:0;color:${colors.ink};font-size:22px;line-height:29px;font-weight:800">${escapeHtml(truncate(opportunity.title, 220))}</h1>
  <p style="margin:8px 0 0;color:${colors.muted};font-size:13px;line-height:19px">${escapeHtml(opportunity.organization)} · ${escapeHtml(opportunity.location)}</p>
  <p style="margin:14px 0 0">${pill(`Propostas até ${deadline}`, colors.mint, colors.greenDark)}</p>
</td></tr>

<tr><td style="padding:18px 32px 0">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${colors.green}">
    <a href="${escapeHtml(opportunityUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Abrir a vaga e os documentos →</a>
  </td></tr></table>
</td></tr>

${sectionTitle("Resumo do edital")}
<tr><td style="padding:0 32px"><p style="margin:0;color:${colors.ink};font-size:14px;line-height:22px">${escapeHtml(insights.resumo)}</p></td></tr>

${fieldRows.length > 0 ? `${sectionTitle("Pontos-chave")}<tr><td style="padding:0 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${fieldRows.join("")}</table></td></tr>` : ""}

${
  insights.alertas.length > 0
    ? `<tr><td style="padding:16px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff6ee;border-radius:12px"><tr><td style="padding:14px 16px"><p style="margin:0 0 6px;color:#7a4a1f;font-size:13px;font-weight:700">⚠️ Pontos de atenção</p>${insights.alertas
        .map(
          (alerta) =>
            `<p style="margin:4px 0 0;color:#7a4a1f;font-size:13px;line-height:19px">• ${escapeHtml(alerta)}</p>`,
        )
        .join("")}</td></tr></table></td></tr>`
    : ""
}

${sectionTitle("Status dos documentos")}
${
  rows.length > 0
    ? `<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${statTile(counts.atendido, "Atendidos", statusStyles.atendido.background, statusStyles.atendido.color)}
        ${statTile(counts.conferir, "A conferir", statusStyles.parcial.background, statusStyles.parcial.color)}
        ${statTile(counts.pendente, "Pendentes", statusStyles.pendente.background, statusStyles.pendente.color)}
      </tr></table></td></tr>
      <tr><td style="padding:14px 32px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.paper};border-radius:999px"><tr>
          ${percent > 0 ? `<td width="${percent}%" style="background:${colors.green};border-radius:999px;height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}
          ${percent < 100 ? `<td style="height:8px;font-size:0;line-height:0">&nbsp;</td>` : ""}
        </tr></table>
        <p style="margin:6px 0 14px;color:${colors.muted};font-size:12px">${percent}% das exigências com documento que atende totalmente</p>
      </td></tr>
      ${stateNotice ? `<tr><td style="padding:0 32px 12px"><p style="margin:0;padding:12px 14px;border-radius:10px;background:${colors.mint};color:${colors.greenDark};font-size:13px;line-height:19px">${stateNotice}</p></td></tr>` : ""}
      ${requirementItems}`
    : `<tr><td style="padding:0 32px"><p style="margin:0;color:${colors.muted};font-size:13px;line-height:19px">A leitura não identificou documentos expressamente exigidos. Confira o edital oficial e seus anexos.</p></td></tr>`
}

${
  documentItems
    ? `${sectionTitle("Seu arquivo de documentos")}<tr><td style="padding:0 32px"><p style="margin:0 0 4px;color:${colors.muted};font-size:12px;line-height:18px">Como cada documento do seu arquivo se encaixa neste edital, segundo a IA.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${documentItems}</table></td></tr>`
    : ""
}

<tr><td style="padding:28px 32px 30px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${colors.line}"><tr><td style="padding-top:18px">
    <p style="margin:0;color:${colors.muted};font-size:12px;line-height:18px">A IA pode errar. Confira requisitos, prazos e cada documento no <a href="${escapeHtml(opportunity.sourceUrl)}" style="color:${colors.green}">edital oficial (PNCP)</a> antes de enviar a proposta. Relatório gerado em ${escapeHtml(formatDate(report?.generatedAt ?? new Date().toISOString()))}.</p>
    <p style="margin:10px 0 0;color:${colors.muted};font-size:12px;line-height:18px">Você recebe este e-mail porque abriu esta vaga na peneir.IA.${settingsUrl ? ` <a href="${escapeHtml(settingsUrl)}" style="color:${colors.muted}">Desativar relatórios por e-mail</a>.` : ""}</p>
  </td></tr></table>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const textLines = [
    `Olá, ${input.name}. A IA terminou de analisar esta vaga:`,
    "",
    opportunity.title,
    `${opportunity.organization} · ${opportunity.location}`,
    `Propostas até ${deadline}`,
    `Abrir: ${opportunityUrl}`,
    "",
    "RESUMO DO EDITAL",
    insights.resumo,
    ...(fields.length > 0
      ? ["", "PONTOS-CHAVE", ...fields.map((key) => `- ${editalFieldLabels[key]}: ${insights.campos[key]}`)]
      : []),
    ...(insights.alertas.length > 0
      ? ["", "PONTOS DE ATENÇÃO", ...insights.alertas.map((alerta) => `- ${alerta}`)]
      : []),
    "",
    "STATUS DOS DOCUMENTOS",
    rows.length > 0
      ? `${counts.atendido} atendidos · ${counts.conferir} a conferir · ${counts.pendente} pendentes`
      : "Nenhum documento exigido foi identificado.",
    ...rows.map(
      (row) =>
        `- [${statusStyles[row.status].label}] ${row.requirement}${
          row.documents.length > 0 ? ` — ${row.documents.map((document) => document.name).join(", ")}` : ""
        }`,
    ),
    "",
    "A IA pode errar. Confira tudo no edital oficial antes de enviar a proposta.",
    ...(settingsUrl ? [`Desativar relatórios por e-mail: ${settingsUrl}`] : []),
  ];

  return {
    subject: reportEmailSubject(input),
    html,
    text: textLines.join("\n"),
    counts: { ...counts, total: rows.length },
  };
}

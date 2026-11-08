import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Resend } from "resend";
import { linkColumns } from "@/lib/document-report";
import { getOpportunityDocumentReport } from "@/lib/document-report-ai";
import { getOpportunityEdital } from "@/lib/edital-store";
import { getOpportunityById } from "@/lib/opportunity-store";
import { buildReportEmail, type DocumentsState } from "@/lib/report-email";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/**
 * O que terminou de ser gerado pela IA:
 * - `document_report`: o relatório dos documentos da pessoa para a vaga;
 * - `edital`: a leitura do edital pedida pela pessoa na página da vaga. Só
 *   envia se o relatório de documentos não for rodar em seguida (sem
 *   consentimento, sem documentos ou sem exigências), para não duplicar.
 */
export type ReportEmailTrigger = "document_report" | "edital";

export type ReportEmailOutcome =
  | "sent"
  | "not_configured"
  | "unconfirmed_email"
  | "disabled"
  | "not_ready"
  | "deferred"
  | "failed";

/**
 * Envia à pessoa o relatório da vaga (leitura do edital + status atual dos
 * documentos). Usa o cliente com a sessão dela (RLS). Nunca lança: falhas são
 * registradas e devolvidas como resultado, pois roda depois da resposta.
 */
export async function sendOpportunityReportEmail(options: {
  supabase: Client;
  user: Pick<User, "id" | "email" | "email_confirmed_at">;
  opportunityId: string;
  trigger: ReportEmailTrigger;
}): Promise<ReportEmailOutcome> {
  const outcome = await trySendOpportunityReportEmail(options);
  // Envios pulados também ficam no log, para diagnosticar e-mails que não chegam.
  if (outcome !== "sent" && outcome !== "failed" && outcome !== "deferred") {
    console.warn("Opportunity report email skipped.", {
      userId: options.user.id,
      opportunityId: options.opportunityId,
      trigger: options.trigger,
      reason: outcome,
    });
  }
  return outcome;
}

async function trySendOpportunityReportEmail({
  supabase,
  user,
  opportunityId,
  trigger,
}: {
  supabase: Client;
  user: Pick<User, "id" | "email" | "email_confirmed_at">;
  opportunityId: string;
  trigger: ReportEmailTrigger;
}): Promise<ReportEmailOutcome> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return "not_configured";
  if (!user.email || !user.email_confirmed_at) return "unconfirmed_email";

  try {
    const [profileResult, opportunity, edital, report, linksResult, documentsResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, report_emails, ai_consent_at")
          .eq("id", user.id)
          .maybeSingle(),
        getOpportunityById(supabase, opportunityId),
        getOpportunityEdital(supabase, opportunityId),
        getOpportunityDocumentReport(supabase, user.id, opportunityId).catch(() => null),
        supabase
          .from("document_opportunities")
          .select(linkColumns)
          .eq("user_id", user.id)
          .eq("opportunity_id", opportunityId),
        supabase.from("documents").select("id, name, expires_at").eq("user_id", user.id),
      ]);
    if (profileResult.error) throw profileResult.error;
    if (linksResult.error) throw linksResult.error;
    if (documentsResult.error) throw documentsResult.error;
    const profile = profileResult.data;
    if (!profile || profile.report_emails === false) return "disabled";
    if (!opportunity || edital?.status !== "ready" || !edital.insights) return "not_ready";

    const documents = documentsResult.data;
    const hasConsent = Boolean(profile.ai_consent_at);
    if (
      trigger === "edital" &&
      hasConsent &&
      documents.length > 0 &&
      edital.requirements.length > 0
    ) {
      // O relatório de documentos roda em seguida e envia o e-mail completo.
      return "deferred";
    }
    if (trigger === "document_report" && report?.status !== "ready") return "not_ready";

    const documentsState: DocumentsState =
      report?.status === "ready"
        ? "analisado"
        : documents.length === 0
          ? "sem_documentos"
          : hasConsent
            ? "analisado"
            : "sem_consentimento";

    const email = buildReportEmail({
      name: profile.full_name?.trim() || "tudo bem",
      opportunity,
      insights: edital.insights,
      requirements: edital.requirements,
      report: report?.status === "ready" ? report.result : null,
      links: linksResult.data,
      documents,
      documentsState,
      appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || null,
    });

    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) throw new Error(error.message);
    return "sent";
  } catch (error) {
    console.error("Opportunity report email failed.", {
      userId: user.id,
      opportunityId,
      trigger,
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}

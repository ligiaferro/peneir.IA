import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getChatModel } from "@/lib/config";
import {
  applyReportLinks,
  generateDocumentReport,
  getReportRequirements,
  type ReportSourceDocument,
} from "@/lib/document-report-ai";
import type { OpportunityEdital } from "@/lib/edital-insights";
import { sendOpportunityReportEmail } from "@/lib/report-email-send";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Opportunity, UserDocumentOpportunityLink } from "@/lib/types";

type Client = SupabaseClient<Database>;

/**
 * Gera um relatório já reservado (`claim_document_report`), grava o
 * resultado, aplica os vínculos da IA e envia o e-mail da vaga. Registra a
 * falha no banco em vez de lançar, para também poder rodar em segundo plano.
 */
export async function runClaimedDocumentReport({
  supabase,
  user,
  opportunity,
  edital,
  documents,
  deferEmail,
}: {
  supabase: Client;
  user: Pick<User, "id" | "email" | "email_confirmed_at">;
  opportunity: Pick<Opportunity, "id" | "title" | "organization" | "summary">;
  edital: OpportunityEdital;
  documents: ReportSourceDocument[];
  /** Agenda o envio do e-mail (ex.: `after`); sem ele, o envio é aguardado. */
  deferEmail?: (task: () => Promise<unknown>) => void;
}): Promise<{ ok: true; links: UserDocumentOpportunityLink[] } | { ok: false }> {
  const save = async (values: {
    status: "ready" | "failed";
    result?: Json | null;
    error?: string | null;
  }) => {
    const { error } = await supabase
      .from("opportunity_document_reports")
      .update({ ...values, model: getChatModel(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("opportunity_id", opportunity.id);
    if (error) throw error;
  };

  try {
    const report = await generateDocumentReport({
      supabase,
      userId: user.id,
      opportunity,
      edital,
      documents,
    });
    const links = await applyReportLinks(supabase, user.id, opportunity.id, report);
    await save({ status: "ready", result: report as unknown as Json, error: null });
    const sendEmail = () =>
      sendOpportunityReportEmail({
        supabase,
        user,
        opportunityId: opportunity.id,
        trigger: "document_report",
      });
    if (deferEmail) deferEmail(sendEmail);
    else await sendEmail();
    return { ok: true, links };
  } catch (error) {
    console.error("Document report failed.", {
      userId: user.id,
      opportunityId: opportunity.id,
      requirements: getReportRequirements(edital).length,
      documents: documents.length,
      error: error instanceof Error ? error.message : String(error),
    });
    await save({
      status: "failed",
      error: "A IA não conseguiu concluir o relatório. Tente novamente.",
    }).catch(() => undefined);
    return { ok: false };
  }
}

/**
 * O relatório de documentos pode rodar para esta pessoa e vaga: há
 * consentimento de IA, documentos no arquivo e exigências no edital lido.
 */
export async function canRunDocumentReport(
  supabase: Client,
  userId: string,
  edital: OpportunityEdital | null,
) {
  if (!edital || edital.status !== "ready" || edital.requirements.length === 0) return false;
  const [profile, documents] = await Promise.all([
    supabase.from("profiles").select("ai_consent_at").eq("id", userId).maybeSingle(),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return Boolean(profile.data?.ai_consent_at) && (documents.count ?? 0) > 0;
}

/**
 * Pede o relatório de documentos em segundo plano numa nova requisição, com o
 * próprio limite de tempo, usando a sessão (cookies) de quem pediu a leitura
 * do edital. Só espera a reserva: a geração continua na outra requisição.
 */
export async function requestBackgroundDocumentReport({
  origin,
  cookie,
  opportunityId,
}: {
  origin: string;
  cookie: string | null;
  opportunityId: string;
}) {
  if (!cookie) return;
  try {
    const response = await fetch(new URL("/api/document-report", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ opportunityId, background: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.error("Background document report was not started.", {
        opportunityId,
        status: response.status,
      });
    }
  } catch (error) {
    console.error("Could not request a background document report.", {
      opportunityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

import { after, NextResponse, type NextRequest } from "next/server";
import {
  applyReportLinks,
  computeReportSignature,
  generateDocumentReport,
  getOpportunityDocumentReport,
  getReportRequirements,
  reportSourceDocumentColumns,
} from "@/lib/document-report-ai";
import { linkColumns, type OpportunityDocumentReport } from "@/lib/document-report";
import { getOpportunityEdital } from "@/lib/edital-store";
import { getChatModel } from "@/lib/config";
import { isChatModelConfigured } from "@/lib/llm";
import { getOpportunityById } from "@/lib/opportunity-store";
import { sendOpportunityReportEmail } from "@/lib/report-email-send";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Extração de textos pendentes e comparação de vários documentos pela IA. */
export const maxDuration = 300;

function publicReport(
  report: Awaited<ReturnType<typeof getOpportunityDocumentReport>>,
): OpportunityDocumentReport | null {
  if (!report) return null;
  return {
    status: report.status,
    result: report.result,
    error: report.error,
    updatedAt: report.updatedAt,
  };
}

/** Relatório atual (usado para acompanhar uma geração em andamento). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Entre para continuar." }, { status: 401 });
  }
  const opportunityId = request.nextUrl.searchParams.get("id") ?? "";
  if (!opportunityId) {
    return NextResponse.json({ error: "Oportunidade inválida." }, { status: 400 });
  }
  try {
    const [report, links] = await Promise.all([
      getOpportunityDocumentReport(supabase, authData.user.id, opportunityId),
      supabase
        .from("document_opportunities")
        .select(linkColumns)
        .eq("user_id", authData.user.id)
        .eq("opportunity_id", opportunityId),
    ]);
    if (links.error) throw links.error;
    return NextResponse.json({ report: publicReport(report), links: links.data });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar o relatório. Confira se a migração 0016 foi executada." },
      { status: 502 },
    );
  }
}

/**
 * Compara todos os documentos do arquivo da empresa com as exigências do
 * edital e vincula automaticamente os que se encaixam total ou parcialmente.
 * Se o relatório já estiver atualizado, devolve o existente sem chamar a IA,
 * a menos que `force` seja true.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Entre para analisar documentos." }, { status: 401 });
  }
  const userId = authData.user.id;

  let opportunityId = "";
  let force = false;
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null) {
      if ("opportunityId" in body && typeof body.opportunityId === "string") {
        opportunityId = body.opportunityId;
      }
      force = "force" in body && body.force === true;
    }
  } catch {
    // Tratado abaixo.
  }
  if (!opportunityId) {
    return NextResponse.json({ error: "Oportunidade inválida." }, { status: 400 });
  }

  const [opportunity, edital, profileResult, documentsResult] = await Promise.all([
    getOpportunityById(supabase, opportunityId).catch(() => null),
    getOpportunityEdital(supabase, opportunityId).catch(() => null),
    supabase.from("profiles").select("ai_consent_at").eq("id", userId).maybeSingle(),
    supabase
      .from("documents")
      .select(reportSourceDocumentColumns)
      .eq("user_id", userId),
  ]);
  if (!opportunity) {
    return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  }
  if (!profileResult.data?.ai_consent_at) {
    return NextResponse.json(
      {
        error: "Autorize o envio dos documentos ao provedor de IA para gerar o relatório.",
        code: "ai_consent_required",
      },
      { status: 403 },
    );
  }
  if (!isChatModelConfigured()) {
    console.error("Document report is unavailable: OPENAI_API_KEY is not configured.");
    return NextResponse.json(
      { error: "A análise por IA não está disponível no momento." },
      { status: 503 },
    );
  }
  if (!edital || edital.status !== "ready" || edital.requirements.length === 0) {
    return NextResponse.json(
      { error: "O relatório de documentos fica disponível depois que o edital é lido e tem exigências identificadas." },
      { status: 409 },
    );
  }
  if (documentsResult.error) {
    return NextResponse.json({ error: "Não foi possível carregar seus documentos." }, { status: 502 });
  }
  const documents = documentsResult.data;
  if (documents.length === 0) {
    return NextResponse.json(
      { error: "Envie documentos da empresa para que a IA possa compará-los com o edital." },
      { status: 409 },
    );
  }

  const signature = computeReportSignature(edital, documents);
  const { data: claimed, error: claimError } = await supabase.rpc("claim_document_report", {
    p_opportunity_id: opportunityId,
    p_signature: signature,
    p_force: force,
  });
  if (claimError) {
    console.error("Could not claim document report.", { error: claimError.message });
    return NextResponse.json(
      { error: "Não foi possível iniciar o relatório. Confira se a migração 0016 foi executada." },
      { status: 502 },
    );
  }
  if (!claimed) {
    // Já atualizado ou em geração por outra requisição.
    const current = await getOpportunityDocumentReport(supabase, userId, opportunityId).catch(
      () => null,
    );
    const { data: links } = await supabase
      .from("document_opportunities")
      .select(linkColumns)
      .eq("user_id", userId)
      .eq("opportunity_id", opportunityId);
    return NextResponse.json(
      { report: publicReport(current), links: links ?? [] },
      { status: current?.status === "processing" ? 202 : 200 },
    );
  }

  const save = async (
    values: { status: "ready" | "failed"; result?: Json | null; error?: string | null },
  ) => {
    const { error } = await supabase
      .from("opportunity_document_reports")
      .update({ ...values, model: getChatModel(), updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("opportunity_id", opportunityId);
    if (error) throw error;
  };

  try {
    const report = await generateDocumentReport({
      supabase,
      userId,
      opportunity,
      edital,
      documents,
    });
    const links = await applyReportLinks(supabase, userId, opportunityId, report);
    await save({ status: "ready", result: report as unknown as Json, error: null });
    // Relatório da vaga por e-mail, depois da resposta para não atrasá-la.
    const user = authData.user;
    after(() =>
      sendOpportunityReportEmail({ supabase, user, opportunityId, trigger: "document_report" }),
    );
    const current = await getOpportunityDocumentReport(supabase, userId, opportunityId);
    return NextResponse.json({ report: publicReport(current), links });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Document report failed.", {
      userId,
      opportunityId,
      requirements: getReportRequirements(edital).length,
      documents: documents.length,
      error: message,
    });
    await save({
      status: "failed",
      error: "A IA não conseguiu concluir o relatório. Tente novamente.",
    }).catch(() => undefined);
    return NextResponse.json(
      { error: "Não foi possível gerar o relatório dos documentos. Tente novamente." },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Portabilidade (LGPD, art. 18, V): exporta os dados da conta em JSON. */
export async function GET() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Entre para baixar seus dados." }, { status: 401 });
  }
  const userId = authData.user.id;

  const [profile, documents, links, analyses, deliveries] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, user_kind, categories, keywords, products_services, states, email_alerts, terms_accepted_at, ai_consent_at, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, name, document_type, expires_at, created_at")
      .eq("user_id", userId),
    supabase
      .from("document_opportunities")
      .select("document_id, opportunity_id, requirement, created_at")
      .eq("user_id", userId),
    supabase
      .from("document_analyses")
      .select("document_id, opportunity_id, result, created_at")
      .eq("user_id", userId),
    supabase
      .from("notification_deliveries")
      .select("opportunity_id, status, sent_at")
      .eq("user_id", userId),
  ]);
  const failed = [profile, documents, links, analyses, deliveries].find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: "Não foi possível reunir seus dados agora." }, { status: 502 });
  }

  const body = {
    exportadoEm: new Date().toISOString(),
    conta: { email: authData.user.email, criadaEm: authData.user.created_at },
    perfil: profile.data,
    documentos: documents.data,
    vinculosComOportunidades: links.data,
    analises: analyses.data,
    alertasEnviados: deliveries.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="peneira-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

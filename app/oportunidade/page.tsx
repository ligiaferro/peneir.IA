import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import { OpportunityDetail } from "@/components/opportunity-detail";
import { getOpportunityById } from "@/lib/opportunity-store";
import { createClient } from "@/lib/supabase/server";
import type { AnalysisResult, UserDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const { id } = await searchParams;
  const opportunityId = typeof id === "string" ? id : "";
  if (!opportunityId) notFound();

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const [opportunity, profileResult, documentsResult, analysesResult] =
    await Promise.all([
      getOpportunityById(supabase, opportunityId),
      supabase
        .from("profiles")
        .select("user_kind")
        .eq("id", authData.user.id)
        .maybeSingle(),
      supabase
        .from("documents")
        .select("id, user_id, opportunity_id, name, document_type, expires_at, storage_path, created_at")
        .eq("user_id", authData.user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("document_analyses")
        .select("document_id, opportunity_id, result")
        .eq("user_id", authData.user.id)
        .eq("opportunity_id", opportunityId),
    ]);

  if (!opportunity) notFound();
  if (profileResult.error || !profileResult.data) {
    throw new Error("Não foi possível carregar seu perfil.");
  }
  if (documentsResult.error) {
    throw new Error(`Não foi possível carregar seus documentos: ${documentsResult.error.message}`);
  }
  if (analysesResult.error) {
    throw new Error(`Não foi possível carregar as análises: ${analysesResult.error.message}`);
  }

  const documents = (documentsResult.data as UserDocument[]).filter(
    (document) =>
      document.opportunity_id === null ||
      document.opportunity_id === opportunityId,
  );
  const analyses = analysesResult.data.map((analysis) => ({
    document_id: analysis.document_id,
    result: analysis.result as AnalysisResult,
  }));

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">p.</span>
          peneir.IA
        </Link>
        <div className="top-actions">
          <span className="user-chip">{authData.user.email}</span>
          {profileResult.data.user_kind === "empresa" && (
            <Link className="button button-secondary button-small" href="/empresa">
              Minha empresa
            </Link>
          )}
          <Link className="button button-secondary button-small" href="/dashboard">
            Oportunidades
          </Link>
          <form action={signOutAction}>
            <button className="button button-secondary button-small" type="submit">
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="main">
        <Link className="back-link" href="/dashboard#oportunidades">
          ← Voltar às oportunidades
        </Link>
        <OpportunityDetail
          opportunity={opportunity}
          initialDocuments={documents}
          initialAnalyses={analyses}
        />
      </main>
    </div>
  );
}

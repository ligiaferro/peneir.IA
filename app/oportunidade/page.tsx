import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import { OpportunityDetail } from "@/components/opportunity-detail";
import { getOpportunityEdital, withEditalRequirements } from "@/lib/edital-store";
import { getOpportunityById } from "@/lib/opportunity-store";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalysisResult,
  UserDocument,
  UserDocumentOpportunityLink,
} from "@/lib/types";

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

  const [
    baseOpportunity,
    edital,
    profileResult,
    documentsResult,
    analysesResult,
    linksResult,
  ] =
    await Promise.all([
      getOpportunityById(supabase, opportunityId),
      // Sem a migração do edital, a página segue com a lista genérica.
      getOpportunityEdital(supabase, opportunityId).catch(() => null),
      supabase
        .from("profiles")
        .select("user_kind, ai_consent_at")
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
      supabase
        .from("document_opportunities")
        .select("user_id, document_id, opportunity_id, requirement, created_at")
        .eq("user_id", authData.user.id)
        .eq("opportunity_id", opportunityId),
    ]);

  if (!baseOpportunity) notFound();
  const opportunity = withEditalRequirements(baseOpportunity, edital);
  if (profileResult.error || !profileResult.data) {
    throw new Error("Não foi possível carregar seu perfil.");
  }
  if (documentsResult.error) {
    throw new Error(`Não foi possível carregar seus documentos: ${documentsResult.error.message}`);
  }
  if (analysesResult.error) {
    throw new Error(`Não foi possível carregar as análises: ${analysesResult.error.message}`);
  }
  if (linksResult.error) {
    throw new Error(`Não foi possível carregar os vínculos dos documentos: ${linksResult.error.message}`);
  }

  const documents = documentsResult.data as UserDocument[];
  const links = linksResult.data as UserDocumentOpportunityLink[];
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
          <Link className="button button-secondary button-small" href="/conta">
            Conta
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
          edital={edital}
          initialDocuments={documents}
          initialAnalyses={analyses}
          initialLinks={links}
          aiConsentGiven={Boolean(profileResult.data.ai_consent_at)}
        />
      </main>
    </div>
  );
}

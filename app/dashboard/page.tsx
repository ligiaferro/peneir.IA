import { redirect } from "next/navigation";
import { OpportunityCard } from "@/components/opportunity-card";
import { ProfileForm } from "@/components/profile-form";
import { signOutAction } from "@/app/auth/actions";
import { getMatchingOpportunities, getSearchCategories } from "@/lib/opportunities";
import { listOpenOpportunities } from "@/lib/opportunity-store";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalysisResult,
  Opportunity,
  OpportunityCategory,
  UserDocument,
  UserKind,
  UserProfile,
} from "@/lib/types";
import { DashboardDocuments } from "./dashboard-documents";

export const dynamic = "force-dynamic";

const maxDisplayedOpportunities = 30;

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const [profileResult, documentsResult, analysesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, user_kind, categories, keywords, email_alerts")
      .eq("id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, user_id, name, document_type, expires_at, storage_path, created_at")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("document_analyses")
      .select("document_id, opportunity_id, result")
      .eq("user_id", authData.user.id),
  ]);
  if (profileResult.error) {
    throw new Error(`Não foi possível carregar seu perfil: ${profileResult.error.message}`);
  }
  if (!profileResult.data) {
    throw new Error(
      "Não foi possível carregar seu perfil. Confira se a migração do Supabase foi executada.",
    );
  }
  if (documentsResult.error) {
    throw new Error(`Não foi possível carregar seus documentos: ${documentsResult.error.message}`);
  }
  if (analysesResult.error) {
    throw new Error(`Não foi possível carregar suas análises: ${analysesResult.error.message}`);
  }

  const profile: UserProfile = {
    id: profileResult.data.id,
    full_name: profileResult.data.full_name,
    user_kind: profileResult.data.user_kind as UserKind,
    categories: profileResult.data.categories as OpportunityCategory[],
    keywords: profileResult.data.keywords,
    email_alerts: profileResult.data.email_alerts,
  };
  const documents = documentsResult.data as UserDocument[];
  const analysisData = analysesResult.data;
  let openOpportunities: Opportunity[];
  try {
    openOpportunities = await listOpenOpportunities(
      supabase,
      getSearchCategories(profile),
    );
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "erro desconhecido";
    throw new Error(
      `Não foi possível carregar as oportunidades: ${message}. Confira se a migração 0002 foi executada.`,
    );
  }
  const hasSearch =
    profile.categories.length > 0 ||
    profile.keywords.some((keyword) => keyword.trim().length > 0);
  const hasDocuments = documents.length > 0;
  const matches = getMatchingOpportunities(profile, openOpportunities);
  const displayedMatches = matches.slice(0, maxDisplayedOpportunities);
  const realMatches = matches.filter((item) => item.source !== "demo").length;

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/dashboard">
          <span className="brand-mark">p.</span>
          peneir.IA
        </a>
        <div className="top-actions">
          <span className="user-chip">{authData.user.email}</span>
          <form action={signOutAction}>
            <button
              className="button button-secondary button-small"
              type="submit"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Seu radar de oportunidades
            </span>
            <h1>
              Menos papelada.
              <br />
              <span>Mais oportunidades.</span>
            </h1>
            <p>
              Acompanhe licitações, concursos, doutorados e bolsas em um só
              lugar. Configure seu perfil para encontrar o que faz sentido para
              você.
            </p>
            <a
              className="button"
              href={
                !hasSearch
                  ? "#perfil"
                  : !hasDocuments
                    ? "#documentos"
                    : "#oportunidades"
              }
            >
              {!hasSearch
                ? "Personalizar minha busca ↓"
                : !hasDocuments
                  ? "Adicionar documentos ↓"
                  : `Ver ${matches.length} oportunidades para mim ↓`}
            </a>
          </div>
          <aside className="hero-aside">
            <div>
              <span className="eyebrow">
                <span className="eyebrow-dot" />
                Um perfil, vários caminhos
              </span>
              <h2>O próximo passo pode estar em um edital.</h2>
              <p>
                Um processo simples para empresas e pessoas, com documentos
                organizados e avisos de novas oportunidades.
              </p>
            </div>
            <div className="aside-categories">
              <span>Compras públicas</span>
              <span>Concursos</span>
              <span>Pós-graduação</span>
              <span>Pesquisa</span>
            </div>
          </aside>
        </section>

        <section className="section" id="perfil">
          <div className="section-heading">
            <div>
              <h2>Seu perfil e documentos</h2>
              <p>Personalize as buscas e organize seus arquivos com segurança.</p>
            </div>
          </div>
          <div className="profile-layout">
            <section className="panel">
              <h3>O que você está buscando?</h3>
              <p className="panel-description">
                Selecione áreas e termos para personalizar suas oportunidades.
              </p>
              <ProfileForm profile={profile} />
            </section>
            {hasSearch && (
              <section className="panel" id="documentos">
                <h3>Meus documentos</h3>
                <p className="panel-description">
                  Com base no seu perfil, estas são algumas sugestões. Envie
                  PDFs privados; o conteúdo só é enviado à OpenAI quando você
                  solicita uma análise.
                </p>
                <DashboardDocuments
                  key={documents
                    .map((document) => `${document.id}:${document.expires_at}`)
                    .join("|")}
                  initialDocuments={documents}
                  categories={profile.categories}
                  keywords={profile.keywords}
                />
              </section>
            )}
          </div>
        </section>

        {hasSearch && hasDocuments && (
        <section className="section" id="oportunidades">
          <div className="section-heading">
            <div>
              <h2>Oportunidades para você</h2>
              <p>
                {matches.length}{" "}
                {matches.length === 1 ? "correspondência" : "correspondências"}{" "}
                com prazo aberto
                {matches.length > displayedMatches.length &&
                  `; mostrando as ${displayedMatches.length} mais recentes. Use palavras-chave no perfil para refinar`}
                . Licitações vêm do PNCP; concursos, doutorados e bolsas ainda
                são dados de demonstração.
              </p>
            </div>
            <span className="badge">
              {realMatches} do PNCP · atualizado diariamente
            </span>
          </div>
          {matches.length === 0 ? (
            <div className="empty-state">
              Nenhuma oportunidade corresponde aos filtros atuais. Atualize as
              categorias ou palavras-chave do seu perfil.
            </div>
          ) : (
            <div className="opportunity-grid">
              {displayedMatches.map((opportunity) => {
                const opportunityAnalyses = analysisData
                  .filter((analysis) => analysis.opportunity_id === opportunity.id)
                  .map((analysis) => ({
                    document_id: analysis.document_id,
                    result: analysis.result as AnalysisResult,
                  }));
                return (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    documents={documents}
                    initialAnalyses={opportunityAnalyses}
                  />
                );
              })}
            </div>
          )}
        </section>
        )}
        <footer className="footer">
          Licitações coletadas do Portal Nacional de Contratações Públicas
          (PNCP); as demais categorias são demonstrativas. Confirme sempre os
          requisitos e prazos no edital original. A análise automatizada é apenas apoio e não
          substitui a conferência humana.
        </footer>
      </main>
    </div>
  );
}

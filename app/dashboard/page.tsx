import { redirect } from "next/navigation";
import { OpportunityCard } from "@/components/opportunity-card";
import { ProfileForm } from "@/components/profile-form";
import { signOutAction } from "@/app/auth/actions";
import { getSearchCategories } from "@/lib/opportunities";
import {
  listMatchingOpportunities,
  upsertOpportunities,
} from "@/lib/opportunity-store";
import { indexPendingOpportunities } from "@/lib/opportunity-indexing";
import {
  fetchOpenContratacoes,
  mapPncpContratacao,
  pncpDateParam,
  type OpportunityRecord,
} from "@/lib/sources/pncp";
import { createServiceClient } from "@/lib/supabase/admin";
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const [profileResult, documentsResult, analysesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, user_kind, categories, keywords, products_services, embedding_model, email_alerts")
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
    products_services: profileResult.data.products_services,
    embedding_model: profileResult.data.embedding_model,
    email_alerts: profileResult.data.email_alerts,
  };
  const documents = documentsResult.data as UserDocument[];
  const analysisData = analysesResult.data;
  const hasSearch =
    profile.categories.length > 0 ||
    profile.keywords.some((keyword) => keyword.trim().length > 0);
  const hasDocuments = documents.length > 0;
  const searchCategories = getSearchCategories(profile);
  const states = [
    ...new Set(
      (process.env.PNCP_UFS ?? "PE")
        .split(",")
        .map((state) => state.trim().toUpperCase())
        .filter((state) => /^[A-Z]{2}$/.test(state)),
    ),
  ];
  let openOpportunities: Opportunity[];
  try {
    openOpportunities = await listMatchingOpportunities(
      supabase,
      profile.id,
      searchCategories,
      states,
    );
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "erro desconhecido";
    throw new Error(
      `Não foi possível carregar as oportunidades: ${message}. Confira se todas as migrações foram executadas.`,
    );
  }
  let pncpRefreshError = false;
  let pncpWasQueried = false;
  if (
    hasSearch &&
    searchCategories.includes("licitacoes")
  ) {
    const stopAt = Date.now() + 6_000;
    const configuredDaysAhead = Number.parseInt(
      process.env.PNCP_DAYS_AHEAD ?? "",
      10,
    );
    const daysAhead =
      Number.isInteger(configuredDaysAhead) && configuredDaysAhead > 0
        ? Math.min(configuredDaysAhead, 365)
        : 60;
    const liveRecords: OpportunityRecord[] = [];

    if (states.length === 0) pncpRefreshError = true;
    for (let index = 0; index < states.length; index += 1) {
      const uf = states[index];
      if (Date.now() + 1_000 >= stopAt) {
        pncpRefreshError = true;
        break;
      }
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        if (Date.now() + 250 >= stopAt) {
          pncpRefreshError = true;
          break;
        }
      }

      try {
        pncpWasQueried = true;
        const result = await fetchOpenContratacoes({
          uf,
          dataFinal: pncpDateParam(daysAhead),
          maxPages: 1,
          pageSize: 50,
          delayMs: 0,
          retryDelaysMs: [],
          stopAt,
          timeoutMs: Math.min(4_000, stopAt - Date.now()),
          userAgent: `peneir.IA/0.1 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://peneir.ia"})`,
        });
        if (result.error) {
          pncpRefreshError = true;
          console.error("PNCP live dashboard query was incomplete.", {
            uf,
            error: result.error,
          });
        }
        const fetchedAt = new Date().toISOString();
        liveRecords.push(
          ...result.items
            .map((item) => mapPncpContratacao(item, fetchedAt, uf))
            .filter((record): record is OpportunityRecord => record !== null),
        );
      } catch (error) {
        pncpRefreshError = true;
        console.error("PNCP live dashboard query failed.", {
          uf,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      pncpRefreshError = true;
      console.error(
        "Cannot persist and index live PNCP results without SUPABASE_SERVICE_ROLE_KEY.",
      );
    } else {
      try {
        const adminClient = createServiceClient();
        if (liveRecords.length > 0) {
          await upsertOpportunities(adminClient, liveRecords);
        }
        const liveIds = [...new Set(liveRecords.map(({ id }) => id))];
        for (let start = 0; start < liveIds.length; start += 100) {
          const indexing = await indexPendingOpportunities(adminClient, {
            ids: liveIds.slice(start, start + 100),
            limit: 100,
          });
          if (indexing.failed > 0) pncpRefreshError = true;
        }
        const pendingIndexing = await indexPendingOpportunities(adminClient, {
          limit: 50,
        });
        if (pendingIndexing.failed > 0 || pendingIndexing.selected === 50) {
          pncpRefreshError = true;
        }
        openOpportunities = await listMatchingOpportunities(
          supabase,
          profile.id,
          searchCategories,
          states,
        );
      } catch (error) {
        pncpRefreshError = true;
        console.error("Could not index live PNCP opportunities.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  const matches = openOpportunities;
  const realMatches = matches.length;

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
                  : !profile.embedding_model
                    ? "#perfil"
                  : !hasDocuments
                    ? "#documentos"
                    : "#oportunidades"
              }
            >
              {!hasSearch
                ? "Personalizar minha busca ↓"
                : !profile.embedding_model
                  ? "Descrever minha atividade ↓"
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
                Empresas precisam descrever o que fornecem. Comparamos essa
                descrição semanticamente com os objetos das licitações.
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
                {matches.length === 1 ? "licitação ativa" : "licitações ativas"}{" "}
                do PNCP, ordenadas por score de similaridade. O percentual
                representa similaridade semântica, não chance de contratação
                ou habilitação.
              </p>
            </div>
            <span className="badge">
              {realMatches} do PNCP ·{" "}
              {pncpRefreshError
                ? "dados salvos e consulta pendente"
                : pncpWasQueried
                  ? "consultado ao carregar"
                  : "atualizado pelo cron"}
            </span>
          </div>
          {pncpRefreshError && (
            <p className="notice">
              Não foi possível atualizar todos os dados do PNCP agora. As
              oportunidades já armazenadas continuam disponíveis.
            </p>
          )}
          {!profile.embedding_model ? (
            <div className="empty-state">
              Para encontrar oportunidades compatíveis, descreva os produtos
              ou serviços da empresa (ou os temas de interesse) e salve o
              perfil. O sistema não exibirá licitações antes de gerar o vetor
              de busca.
            </div>
          ) : matches.length === 0 ? (
            <div className="empty-state">
              Nenhuma licitação ativa e indexada foi encontrada nas categorias
              e UFs selecionadas. O PNCP é a fonte de licitações conectada.
            </div>
          ) : (
            <div className="opportunity-grid">
              {matches.map((opportunity) => {
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
          (PNCP). Confirme sempre os requisitos e prazos no edital original. A
          análise automatizada é apenas apoio e não substitui a conferência
          humana.
        </footer>
      </main>
    </div>
  );
}

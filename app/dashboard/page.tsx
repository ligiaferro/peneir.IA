import { redirect } from "next/navigation";
import Link from "next/link";
import { OpportunityCard } from "@/components/opportunity-card";
import { ProfileForm } from "@/components/profile-form";
import { SendAlertButton } from "@/components/send-alert-button";
import { signOutAction } from "@/app/auth/actions";
import { getSearchCategories } from "@/lib/opportunities";
import {
  suggestDocumentsForRequirement,
  type SuggestibleDocument,
} from "@/lib/document-matching";
import {
  listMatchingOpportunities,
  upsertOpportunities,
} from "@/lib/opportunity-store";
import { mapWithConcurrency } from "@/lib/concurrency";
import { indexPendingOpportunities } from "@/lib/opportunity-indexing";
import {
  fetchOpenContratacoes,
  mapPncpContratacao,
  pncpDateParam,
  type OpportunityRecord,
} from "@/lib/sources/pncp";
import { brazilianStateCodes, normalizeStates } from "@/lib/states";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Opportunity,
  OpportunityCategory,
  UserKind,
  UserProfile,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const profileResult = await supabase
      .from("profiles")
      .select("id, full_name, user_kind, categories, keywords, products_services, embedding_model, states, email_alerts")
      .eq("id", authData.user.id)
      .maybeSingle();
  if (profileResult.error) {
    throw new Error(`Não foi possível carregar seu perfil: ${profileResult.error.message}`);
  }
  if (!profileResult.data) {
    throw new Error(
      "Não foi possível carregar seu perfil. Confira se a migração do Supabase foi executada.",
    );
  }

  const profile: UserProfile = {
    id: profileResult.data.id,
    full_name: profileResult.data.full_name,
    user_kind: profileResult.data.user_kind as UserKind,
    categories: profileResult.data.categories as OpportunityCategory[],
    keywords: profileResult.data.keywords,
    products_services: profileResult.data.products_services,
    embedding_model: profileResult.data.embedding_model,
    states: profileResult.data.states ?? [],
    email_alerts: profileResult.data.email_alerts,
  };
  const hasSearch =
    profile.categories.length > 0 ||
    profile.keywords.some((keyword) => keyword.trim().length > 0);
  const searchCategories = getSearchCategories(profile);
  // Busca nos estados escolhidos; sem escolha, em todas as UFs coletadas.
  const matchStates =
    profile.states.length > 0 ? profile.states : brazilianStateCodes;
  // A consulta ao vivo cobre só os estados escolhidos (ou os de PNCP_UFS), para
  // caber no tempo de carregamento da página.
  const liveStates =
    profile.states.length > 0
      ? profile.states
      : normalizeStates((process.env.PNCP_UFS ?? "PE").split(",")).states;
  let openOpportunities: Opportunity[];
  try {
    openOpportunities = await listMatchingOpportunities(
      supabase,
      profile.id,
      searchCategories,
      matchStates,
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
    const configuredConcurrency = Number.parseInt(
      process.env.PNCP_CONCURRENCY ?? "",
      10,
    );
    const concurrency =
      Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
        ? Math.min(configuredConcurrency, 6)
        : 3;

    if (liveStates.length === 0) pncpRefreshError = true;
    // Uma página por UF, com até `concurrency` UFs consultadas ao mesmo tempo.
    const liveResults = await mapWithConcurrency(
      liveStates,
      concurrency,
      async (uf): Promise<OpportunityRecord[]> => {
        if (Date.now() + 1_000 >= stopAt) {
          pncpRefreshError = true;
          return [];
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
          return result.items
            .map((item) => mapPncpContratacao(item, fetchedAt, uf))
            .filter((record): record is OpportunityRecord => record !== null);
        } catch (error) {
          pncpRefreshError = true;
          console.error("PNCP live dashboard query failed.", {
            uf,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }
      },
    );
    const liveRecords = liveResults.flat();

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
          matchStates,
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
  const priorDocuments: SuggestibleDocument[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("documents")
      .select("id, name, document_type, expires_at, created_at")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      throw new Error(
        `Não foi possível carregar seus documentos para verificar as oportunidades: ${error.message}`,
      );
    }
    priorDocuments.push(...data);
    if (data.length < 1000) break;
  }
  const compatibleRequirements = new Set(
    [
      ...new Set(matches.flatMap((opportunity) => opportunity.requirements)),
    ].filter(
      (requirement) =>
        suggestDocumentsForRequirement(requirement, priorDocuments).length > 0,
    ),
  );
  const linkedRequirementsByOpportunity = new Map<string, Set<string>>();
  const opportunityIds = matches.map((opportunity) => opportunity.id);
  const opportunityBatchSize = 100;
  const linkPageSize = 1000;
  for (
    let start = 0;
    start < opportunityIds.length;
    start += opportunityBatchSize
  ) {
    const batch = opportunityIds.slice(start, start + opportunityBatchSize);
    for (let offset = 0; ; offset += linkPageSize) {
      const { data, error } = await supabase
        .from("document_opportunities")
        .select("opportunity_id, requirement")
        .eq("user_id", authData.user.id)
        .in("opportunity_id", batch)
        .order("opportunity_id", { ascending: true })
        .order("document_id", { ascending: true })
        .order("requirement", { ascending: true })
        .range(offset, offset + linkPageSize - 1);
      if (error) {
        throw new Error(
          `Não foi possível carregar os documentos vinculados às oportunidades: ${error.message}`,
        );
      }
      for (const link of data) {
        const requirements =
          linkedRequirementsByOpportunity.get(link.opportunity_id) ??
          new Set<string>();
        requirements.add(link.requirement);
        linkedRequirementsByOpportunity.set(
          link.opportunity_id,
          requirements,
        );
      }
      if (data.length < linkPageSize) break;
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/dashboard">
          <span className="brand-mark">p.</span>
          peneir.IA
        </a>
        <div className="top-actions">
          <span className="user-chip">{authData.user.email}</span>
          {profile.user_kind === "empresa" && (
            <Link className="button button-secondary button-small" href="/empresa">
              Minha empresa
            </Link>
          )}
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
                  ? profile.user_kind === "empresa" ? "/empresa" : "#perfil"
                  : !profile.embedding_model
                    ? profile.user_kind === "empresa" ? "/empresa" : "#perfil"
                    : "#oportunidades"
              }
            >
              {!hasSearch
                ? profile.user_kind === "empresa" ? "Completar dados da empresa →" : "Personalizar minha busca ↓"
                : !profile.embedding_model
                  ? profile.user_kind === "empresa" ? "Completar dados da empresa →" : "Descrever minha atividade ↓"
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
              <h2>{profile.user_kind === "empresa" ? "Perfil da empresa" : "Seu perfil"}</h2>
              <p>Personalize as oportunidades que fazem sentido para você.</p>
            </div>
          </div>
          {profile.user_kind === "empresa" ? (
            <section className="panel">
              <h3>{profile.full_name}</h3>
              <p className="panel-description">
                Gerencie os dados da empresa e os documentos enviados para cada oportunidade.
              </p>
              <Link className="button button-small" href="/empresa">
                Acessar página da empresa
              </Link>
            </section>
          ) : (
            <section className="panel">
              <h3>O que você está buscando?</h3>
              <p className="panel-description">
                Personalize categorias e temas para encontrar oportunidades compatíveis.
              </p>
              <ProfileForm profile={profile} />
            </section>
          )}
        </section>

        {hasSearch && (
        <section className="section" id="oportunidades">
          <div className="section-heading">
            <div>
              <h2>Oportunidades para você</h2>
              <p>
                {matches.length}{" "}
                {matches.length === 1 ? "licitação ativa" : "licitações ativas"}{" "}
                do PNCP
                {profile.states.length > 0 && ` em ${profile.states.join(", ")}`},
                ordenadas por score de similaridade. O percentual representa
                similaridade semântica, não chance de contratação ou
                habilitação.
              </p>
            </div>
            {matches.length > 0 && (
              <p className="linked-document-legend">
                <span className="requirement-linked-check" aria-hidden="true">
                  ✓
                </span>{" "}
                Já adicionado
                <span
                  className="requirement-linked-check requirement-suggested-check"
                  aria-hidden="true"
                >
                  ✓
                </span>{" "}
                Compatível disponível, ainda não adicionado
              </p>
            )}
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
          {profile.embedding_model && authData.user.email && (
            <SendAlertButton email={authData.user.email} />
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
              e estados selecionados. O PNCP é a fonte de licitações
              conectada; ajuste categorias, palavras-chave ou estados do
              perfil.
            </div>
          ) : (
            <div className="opportunity-grid">
              {matches.map((opportunity) => {
                return (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    linkedRequirements={[
                      ...(linkedRequirementsByOpportunity.get(opportunity.id) ??
                        []),
                    ]}
                    suggestedRequirements={opportunity.requirements.filter(
                      (requirement) =>
                        !linkedRequirementsByOpportunity
                          .get(opportunity.id)
                          ?.has(requirement) &&
                        compatibleRequirements.has(requirement),
                    )}
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

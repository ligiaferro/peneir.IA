import { redirect } from "next/navigation";
import Link from "next/link";
import {
  canReadEditaisAutomatically,
  loadDashboardProfile,
  loadLinkedRequirements,
  loadPriorDocuments,
  scheduleAutomaticEditalReads,
  scheduleLiveRefresh,
} from "@/app/dashboard/data";
import { OpportunityCard } from "@/components/opportunity-card";
import { ProfileForm } from "@/components/profile-form";
import { DashboardFiltersForm } from "@/components/dashboard-filters-form";
import { SendAlertButton } from "@/components/send-alert-button";
import { signOutAction } from "@/app/auth/actions";
import { getSearchCategories } from "@/lib/opportunities";
import { suggestDocumentsForRequirement } from "@/lib/document-matching";
import {
  dashboardHref,
  dashboardPageSize,
  hasActiveFilters,
  parseDashboardFilters,
} from "@/lib/dashboard-filters";
import { getOpportunityEditais, withEditalRequirements } from "@/lib/edital-store";
import { searchMatchingOpportunities } from "@/lib/opportunity-store";
import { shouldAutomaticallyReadEdital } from "@/lib/edital-automation";
import type { EditalStatus, OpportunityEdital } from "@/lib/edital-insights";
import {
  hasStaleProfileEmbedding,
  refreshStaleProfileEmbeddings,
} from "@/lib/profile-embedding";
import { brazilianStateCodes } from "@/lib/states";
import { createClient } from "@/lib/supabase/server";
import type { Opportunity } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Margem para o que roda em segundo plano (after): atualização do PNCP e leitura de editais. */
export const maxDuration = 300;

function formatAge(timestamp: number) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} dia(s)`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const profile = await loadDashboardProfile(supabase, authData.user.id);

  // Vetor de um modelo de embeddings antigo: revetoriza para a busca voltar a
  // funcionar (ela só compara vetores do mesmo modelo).
  let profileEmbeddingOutdated = false;
  if (hasStaleProfileEmbedding(profile)) {
    const refreshed = await refreshStaleProfileEmbeddings(supabase, [profile]);
    profileEmbeddingOutdated = refreshed.length === 0;
  }

  const hasSearch =
    profile.categories.length > 0 ||
    profile.keywords.some((keyword) => keyword.trim().length > 0);
  const searchCategories = getSearchCategories(profile);
  // Busca nos estados escolhidos; sem escolha, em todas as UFs coletadas.
  const matchStates =
    profile.states.length > 0 ? profile.states : brazilianStateCodes;
  const filters = parseDashboardFilters(await searchParams, matchStates);

  const liveRefresh =
    hasSearch && searchCategories.includes("licitacoes")
      ? await scheduleLiveRefresh(supabase, profile.states)
      : { scheduled: false, lastRefreshedAt: null, checkFailed: false };
  const { scheduled: refreshScheduled, lastRefreshedAt } = liveRefresh;

  let matches: Opportunity[];
  let totalMatches: number;
  const editalStatuses = new Map<string, EditalStatus>();
  let editalStatusUnavailable = false;
  try {
    const result = await searchMatchingOpportunities(supabase, profile.id, {
      categories: searchCategories,
      regions: filters.uf ? [filters.uf] : matchStates,
      query: filters.query,
      deadlineBefore: filters.deadlineDays
        ? new Date(Date.now() + filters.deadlineDays * 24 * 60 * 60 * 1000)
        : null,
      order: filters.order,
      page: filters.page,
      pageSize: dashboardPageSize,
    });
    totalMatches = result.total;
    // Os requisitos lidos do edital substituem a lista genérica nos cards.
    let editais = new Map<string, OpportunityEdital>();
    try {
      editais = await getOpportunityEditais(
        supabase,
        result.opportunities.map(({ id }) => id),
      );
      for (const [id, edital] of editais) {
        editalStatuses.set(id, edital.status);
      }
    } catch (error) {
      editalStatusUnavailable = true;
      console.error("Could not load edital status for dashboard cards.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    matches = result.opportunities.map((opportunity) =>
      withEditalRequirements(opportunity, editais.get(opportunity.id) ?? null),
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
  const totalPages = Math.max(1, Math.ceil(totalMatches / dashboardPageSize));
  const filtered = hasActiveFilters(filters);
  const priorDocuments = await loadPriorDocuments(supabase, authData.user.id);
  const compatibleRequirements = new Set(
    [
      ...new Set(matches.flatMap((opportunity) => opportunity.requirements)),
    ].filter(
      (requirement) =>
        suggestDocumentsForRequirement(requirement, priorDocuments).length > 0,
    ),
  );
  // Editais ainda não lidos e compatíveis: a leitura corre no servidor, em
  // segundo plano e com poucas leituras ao mesmo tempo; os cards só acompanham.
  const autoReadOpportunities = editalStatusUnavailable || !canReadEditaisAutomatically()
    ? []
    : matches.filter(
        (opportunity) =>
          !editalStatuses.has(opportunity.id) &&
          opportunity.matchScore !== undefined &&
          shouldAutomaticallyReadEdital(opportunity.matchScore),
      );
  scheduleAutomaticEditalReads(autoReadOpportunities, maxDuration);
  const autoReadIds = new Set(autoReadOpportunities.map(({ id }) => id));
  const linkedRequirementsByOpportunity = await loadLinkedRequirements(
    supabase,
    authData.user.id,
    matches.map((opportunity) => opportunity.id),
  );
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
          <Link className="button button-secondary button-small" href="/conta">
            Conta
          </Link>
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
                  : `Ver ${totalMatches} oportunidades para mim ↓`}
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
                {totalMatches}{" "}
                {totalMatches === 1 ? "licitação ativa" : "licitações ativas"}{" "}
                do PNCP
                {filtered ? " com os filtros escolhidos" : ""}
                {!filtered && profile.states.length > 0 && ` em ${profile.states.join(", ")}`}.
                O percentual representa similaridade semântica, não chance de
                contratação ou habilitação.
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
              {refreshScheduled
                ? "Atualizando com o PNCP em segundo plano"
                : liveRefresh.checkFailed
                  ? "Não foi possível verificar a atualização do PNCP agora"
                  : lastRefreshedAt
                  ? `PNCP atualizado ${formatAge(lastRefreshedAt)}`
                  : "Atualizado pelo cron diário"}
            </span>
          </div>
          {profileEmbeddingOutdated && (
            <p className="notice notice-error">
              O modelo de busca foi atualizado e não conseguimos refazer o seu
              perfil agora. Salve o perfil novamente para voltar a ver
              oportunidades.
            </p>
          )}
          {profile.embedding_model && (
            <DashboardFiltersForm
              filters={filters}
              states={matchStates}
              usesProfileStates={profile.states.length > 0}
            />
          )}
          {editalStatusUnavailable && (
            <p className="notice notice-error">
              Não foi possível consultar o estado da leitura dos editais. A leitura
              automática dos cards foi pausada; confira a migração 0008.
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
              {filtered
                ? "Nenhuma licitação corresponde aos filtros. Tente outros termos, outro estado ou um prazo maior."
                : "Nenhuma licitação ativa e indexada foi encontrada nas categorias e estados selecionados. O PNCP é a fonte de licitações conectada; ajuste categorias, palavras-chave ou estados do perfil."}
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
                    initialEditalStatus={editalStatuses.get(opportunity.id) ?? null}
                    autoReadEligible={autoReadIds.has(opportunity.id)}
                  />
                );
              })}
            </div>
          )}
          {totalPages > 1 && (
            <nav className="pagination" aria-label="Páginas de oportunidades">
              {filters.page > 1 ? (
                <Link
                  className="button button-secondary button-small"
                  href={dashboardHref(filters, { page: filters.page - 1 })}
                >
                  ← Anteriores
                </Link>
              ) : (
                <span />
              )}
              <span className="pagination-status">
                Página {Math.min(filters.page, totalPages)} de {totalPages}
              </span>
              {filters.page < totalPages ? (
                <Link
                  className="button button-secondary button-small"
                  href={dashboardHref(filters, { page: filters.page + 1 })}
                >
                  Próximas →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
        )}
        <footer className="footer">
          Licitações coletadas do Portal Nacional de Contratações Públicas
          (PNCP). Confirme sempre os requisitos e prazos no edital original. A
          análise automatizada é apenas apoio e não substitui a conferência
          humana.{" "}
          <Link href="/privacidade">Privacidade</Link> ·{" "}
          <Link href="/termos">Termos de uso</Link>
        </footer>
      </main>
    </div>
  );
}

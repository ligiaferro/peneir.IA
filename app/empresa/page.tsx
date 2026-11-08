import { redirect } from "next/navigation";
import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import { ProfileForm } from "@/components/profile-form";
import type { CompanyDocument } from "./company-documents";
import { CompanyDocuments } from "./company-documents";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/session";
import { parseCompanySize } from "@/lib/company-lookup";
import { isOpportunityCategory } from "@/lib/opportunities";
import type { UserKind, UserProfile } from "@/lib/types";
import { BrandMark } from "@/components/brand-mark";

export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect("/login");

  const [profileResult, documentsResult, analysesResult, linksResult] =
    await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, user_kind, cnpj, company_size, categories, keywords, products_services, embedding_model, states, email_alerts")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, user_id, opportunity_id, name, document_type, expires_at, storage_path, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("document_analyses")
      .select("document_id, opportunity_id")
      .eq("user_id", user.id),
    supabase
      .from("document_opportunities")
      .select("document_id, opportunity_id, requirement, added_by")
      .eq("user_id", user.id),
  ]);
  if (profileResult.error || !profileResult.data) {
    throw new Error("Não foi possível carregar os dados da empresa.");
  }
  if (documentsResult.error) {
    throw new Error(`Não foi possível carregar os documentos: ${documentsResult.error.message}`);
  }
  if (analysesResult.error) {
    throw new Error(`Não foi possível carregar o histórico: ${analysesResult.error.message}`);
  }
  if (linksResult.error) {
    throw new Error(`Não foi possível carregar os vínculos dos documentos: ${linksResult.error.message}`);
  }
  if (profileResult.data.user_kind !== "empresa") redirect("/dashboard");

  const profile: UserProfile = {
    id: profileResult.data.id,
    full_name: profileResult.data.full_name,
    user_kind: profileResult.data.user_kind as UserKind,
    cnpj: profileResult.data.cnpj,
    company_size: parseCompanySize(profileResult.data.company_size),
    categories: profileResult.data.categories.filter(isOpportunityCategory),
    keywords: profileResult.data.keywords,
    products_services: profileResult.data.products_services,
    embedding_model: profileResult.data.embedding_model,
    states: profileResult.data.states ?? [],
    email_alerts: profileResult.data.email_alerts,
  };
  const opportunityIds = [
    ...new Set([
      ...documentsResult.data.flatMap((document) =>
        document.opportunity_id ? [document.opportunity_id] : [],
      ),
      ...analysesResult.data.map((analysis) => analysis.opportunity_id),
      ...linksResult.data.map((link) => link.opportunity_id),
    ]),
  ];
  const opportunitiesResult =
    opportunityIds.length > 0
      ? await supabase
          .from("opportunities")
          .select("id, title, source_url")
          .in("id", opportunityIds)
      : { data: [], error: null };
  if (opportunitiesResult.error) {
    throw new Error("Não foi possível carregar as oportunidades dos documentos.");
  }
  const opportunities = new Map(
    (opportunitiesResult.data ?? []).map((opportunity) => [
      opportunity.id,
      opportunity,
    ]),
  );
  const opportunityIdsByDocument = new Map<string, Map<string, Set<string>>>();
  const aiLinkedPairs = new Set(
    linksResult.data
      .filter((link) => link.added_by === "ai")
      .map((link) => `${link.document_id}\u0000${link.opportunity_id}`),
  );
  const addOpportunityForDocument = (
    documentId: string,
    opportunityId: string,
    requirement?: string,
  ) => {
    const linked = opportunityIdsByDocument.get(documentId) ?? new Map();
    const requirements = linked.get(opportunityId) ?? new Set<string>();
    if (requirement) requirements.add(requirement);
    linked.set(opportunityId, requirements);
    opportunityIdsByDocument.set(documentId, linked);
  };
  for (const link of linksResult.data) {
    addOpportunityForDocument(
      link.document_id,
      link.opportunity_id,
      link.requirement,
    );
  }
  for (const analysis of analysesResult.data) {
    addOpportunityForDocument(analysis.document_id, analysis.opportunity_id);
  }
  const companyDocuments: CompanyDocument[] = documentsResult.data.map(
    (document) => {
      const relatedOpportunities =
        opportunityIdsByDocument.get(document.id) ?? new Map();
      if (document.opportunity_id) {
        addOpportunityForDocument(
          document.id,
          document.opportunity_id,
          document.document_type,
        );
      }
      const documentOpportunities =
        opportunityIdsByDocument.get(document.id) ?? relatedOpportunities;
      return {
        ...document,
        opportunities: [...documentOpportunities.entries()]
          .flatMap(([id, requirements]) => {
            const opportunity = opportunities.get(id);
            return opportunity
              ? [
                  {
                    ...opportunity,
                    requirements: [...requirements],
                    addedByAi: aiLinkedPairs.has(`${document.id}\u0000${id}`),
                  },
                ]
              : [];
          }),
      };
    },
  );

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          <BrandMark />
          peneir.IA
        </Link>
        <div className="top-actions">
          <span className="user-chip">{user.email}</span>
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
        <section className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Área da empresa</span>
              <h1 className="company-title">{profile.full_name}</h1>
              <p>
                Edite os dados da empresa e mantenha o arquivo de documentos atualizado: a IA
                compara esses documentos com as exigências de cada edital.
              </p>
            </div>
          </div>
          <div className="profile-layout">
            <section className="panel">
              <h2>Dados da empresa</h2>
              <p className="panel-description">
                Essas informações personalizam as oportunidades encontradas para sua empresa.
              </p>
              <ProfileForm profile={profile} />
            </section>
            <section className="panel" id="documentos">
              <h2>Arquivo de documentos da empresa</h2>
              <p className="panel-description">
                Todos os documentos enviados na plataforma ficam aqui. Ao ler um edital, a IA
                indica quais deles atendem total ou parcialmente a cada exigência e já os vincula
                à oportunidade. Edite os metadados ou remova documentos quando precisar.
              </p>
              <CompanyDocuments initialDocuments={companyDocuments} />
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}

import { Resend } from "resend";
import { NextResponse, type NextRequest } from "next/server";
import {
  isAboveSemanticMatchThreshold,
  minimumOpportunitySimilarity,
} from "@/lib/ai";
import { isCronAuthorized } from "@/lib/cron-auth";
import {
  alertEmailHtml,
  alertEmailSubject,
  maxItemsPerEmail,
} from "@/lib/alert-email";
import { listOpenOpportunities } from "@/lib/opportunity-store";
import { refreshStaleProfileEmbeddings } from "@/lib/profile-embedding";
import { buildUnsubscribeUrls, unsubscribeHeaders } from "@/lib/unsubscribe";
import { brazilianStateCodes, normalizeStates } from "@/lib/states";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Opportunity } from "@/lib/types";
import { opportunityCategories } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Só avisa sobre oportunidades vistas pela primeira vez nesta janela. */
const newOpportunityWindowMs = 3 * 24 * 60 * 60 * 1000;
/** Mantém a resposta RPC abaixo do limite padrão de linhas do PostgREST. */
const semanticMatchBatchSize = 40;
/** Pausa entre envios para respeitar o limite de taxa do Resend. */
const delayBetweenEmailsMs = 600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ServiceClient = ReturnType<typeof createServiceClient>;
type DeliveryUpdate = Database["public"]["Tables"]["notification_deliveries"]["Update"];

/** Lotes de ids por requisição, para a URL do filtro `in` não ficar longa demais. */
const deliveryBatchSize = 100;
/** O PostgREST limita cada resposta (padrão: 1000 linhas). */
const readPageSize = 1000;

async function updateDeliveries(
  supabase: ServiceClient,
  userId: string,
  opportunityIds: string[],
  values: DeliveryUpdate,
) {
  for (let start = 0; start < opportunityIds.length; start += deliveryBatchSize) {
    const { error } = await supabase
      .from("notification_deliveries")
      .update(values)
      .eq("user_id", userId)
      .in("opportunity_id", opportunityIds.slice(start, start + deliveryBatchSize));
    if (error) throw error;
  }
}

/** Devolve reservas para "pending", para serem reenviadas na próxima execução. */
async function releaseClaims(
  supabase: ServiceClient,
  userId: string,
  opportunityIds: string[],
) {
  if (opportunityIds.length === 0) return;
  try {
    await updateDeliveries(supabase, userId, opportunityIds, {
      status: "pending",
      updated_at: new Date().toISOString(),
    });
  } catch {
    console.error("Could not reset failed opportunity notifications.", { userId });
  }
}

async function loadAuthUsers(supabase: ServiceClient) {
  const authUsers = new Map<string, { email: string | null }>();
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users) {
      authUsers.set(user.id, {
        email: user.email ?? null,
      });
    }
    if (data.users.length < perPage) break;
  }
  return authUsers;
}

async function loadAlertProfiles(supabase: ServiceClient) {
  const profiles: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "id" | "full_name" | "categories" | "keywords" | "states" | "products_services" | "embedding_model"
  >[] = [];
  for (let from = 0; ; from += readPageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, categories, keywords, states, products_services, embedding_model")
      .eq("email_alerts", true)
      .order("id")
      .range(from, from + readPageSize - 1);
    if (error) throw error;
    profiles.push(...data);
    if (data.length < readPageSize) break;
  }
  return profiles;
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json(
      { error: "Configure RESEND_API_KEY e RESEND_FROM_EMAIL para executar alertas." },
      { status: 503 },
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();

  let authUsers: Awaited<ReturnType<typeof loadAuthUsers>>;
  try {
    authUsers = await loadAuthUsers(supabase);
  } catch {
    console.error("Could not load Supabase Auth users for opportunity alerts.");
    return NextResponse.json(
      { error: "Não foi possível consultar as contas de autenticação." },
      { status: 502 },
    );
  }

  let profiles: Awaited<ReturnType<typeof loadAlertProfiles>>;
  let openOpportunities: Opportunity[];
  try {
    [profiles, openOpportunities] = await Promise.all([
      loadAlertProfiles(supabase),
      listOpenOpportunities(supabase, opportunityCategories),
    ]);
  } catch (error) {
    console.error("Could not load profiles or opportunities for alerts.", {
      error: error && typeof error === "object" && "message" in error ? error.message : error,
    });
    return NextResponse.json(
      { error: "Não foi possível consultar perfis e oportunidades." },
      { status: 502 },
    );
  }

  // Perfis com vetor de um modelo antigo não encontrariam nada na busca.
  await refreshStaleProfileEmbeddings(supabase, profiles);

  const newSince = Date.now() - newOpportunityWindowMs;
  const newOpportunities = openOpportunities.filter(
    (opportunity) =>
      new Date(opportunity.firstSeenAt).getTime() >= newSince,
  );
  // Perfis sem estado escolhido recebem oportunidades de todas as UFs. Os perfis
  // são agrupados por estados porque o limite por usuário é aplicado no banco,
  // antes de qualquer filtro feito aqui.
  const profilesByStates = new Map<string, { states: string[]; ids: string[] }>();
  for (const profile of profiles) {
    const { states: chosen } = normalizeStates(profile.states);
    const states = chosen.length > 0 ? chosen : brazilianStateCodes;
    const key = states.join(",");
    const group = profilesByStates.get(key) ?? { states, ids: [] };
    group.ids.push(profile.id);
    profilesByStates.set(key, group);
  }
  const vectorMatches: Array<{
    user_id: string;
    opportunity_id: string;
    similarity: number;
  }> = [];
  try {
    for (const { states, ids } of profilesByStates.values()) {
      for (let start = 0; start < ids.length; start += semanticMatchBatchSize) {
        const { data, error } = await supabase.rpc(
          "match_opportunities_for_users",
          {
            p_user_ids: ids.slice(start, start + semanticMatchBatchSize),
            p_regions: states,
            p_min_similarity: minimumOpportunitySimilarity,
            p_limit_per_user: maxItemsPerEmail,
            p_created_since: new Date(newSince).toISOString(),
          },
        );
        if (error) throw error;
        vectorMatches.push(...data);
      }
    }
  } catch (error) {
    console.error("Could not semantically match opportunities for email alerts.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Não foi possível comparar oportunidades com os perfis." },
      { status: 502 },
    );
  }
  const matchesByUser = new Map<string, Set<string>>();
  for (const match of vectorMatches) {
    if (!isAboveSemanticMatchThreshold(match.similarity)) continue;
    const ids = matchesByUser.get(match.user_id) ?? new Set<string>();
    ids.add(match.opportunity_id);
    matchesByUser.set(match.user_id, ids);
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let emailsSent = 0;

  for (const profile of profiles) {
    const matchedIds = matchesByUser.get(profile.id) ?? new Set<string>();
    const matches = newOpportunities.filter(({ id }) => matchedIds.has(id));
    if (matches.length === 0) continue;

    const authUser = authUsers.get(profile.id);
    if (!authUser) {
      failed += 1;
      console.error("Could not find auth user for opportunity profile.", {
        userId: profile.id,
      });
      continue;
    }
    if (!authUser.email) {
      skipped += 1;
      continue;
    }

    const claimed: Opportunity[] = [];
    let claimFailed = false;
    for (const opportunity of matches) {
      const { data, error } = await supabase.rpc("claim_opportunity_notification", {
        p_user_id: profile.id,
        p_opportunity_id: opportunity.id,
      });
      if (error) {
        claimFailed = true;
        break;
      }
      if (data) claimed.push(opportunity);
    }
    if (claimFailed) {
      failed += 1;
      console.error("Could not claim opportunity notifications.", {
        userId: profile.id,
      });
      await releaseClaims(
        supabase,
        profile.id,
        claimed.map((opportunity) => opportunity.id),
      );
      continue;
    }
    if (claimed.length === 0) continue;

    claimed.sort((a, b) => a.deadline.localeCompare(b.deadline));
    const claimedIds = claimed.map((opportunity) => opportunity.id);

    const unsubscribeUrls = buildUnsubscribeUrls(profile.id);
    if (emailsSent > 0) await sleep(delayBetweenEmailsMs);
    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: authUser.email,
      subject: alertEmailSubject(claimed),
      html: alertEmailHtml(profile.full_name || "Olá", claimed, {
        unsubscribeUrl: unsubscribeUrls?.page,
      }),
      headers: unsubscribeHeaders(unsubscribeUrls),
    });
    emailsSent += 1;

    if (emailError) {
      await releaseClaims(supabase, profile.id, claimedIds);
      failed += 1;
      console.error("Opportunity email delivery failed.", {
        userId: profile.id,
      });
      continue;
    }

    try {
      const sentAt = new Date().toISOString();
      await updateDeliveries(supabase, profile.id, claimedIds, {
        status: "sent",
        updated_at: sentAt,
        sent_at: sentAt,
      });
    } catch {
      failed += 1;
      console.error("Email sent but delivery status could not be saved.", {
        userId: profile.id,
      });
      continue;
    }
    sent += claimed.length;
  }

  if (failed > 0) {
    return NextResponse.json(
      { status: "partial_failure", sent, emailsSent, skipped, failed },
      { status: 502 },
    );
  }
  return NextResponse.json({ status: "complete", sent, emailsSent, skipped, failed });
}

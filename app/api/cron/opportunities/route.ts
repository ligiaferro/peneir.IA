import { Resend } from "resend";
import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { formatDeadline } from "@/lib/format";
import { getMatchingOpportunities } from "@/lib/opportunities";
import { listOpenOpportunities } from "@/lib/opportunity-store";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Opportunity } from "@/lib/types";
import { opportunityCategories } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Só avisa sobre oportunidades vistas pela primeira vez nesta janela. */
const newOpportunityWindowMs = 3 * 24 * 60 * 60 * 1000;
/** Itens listados no corpo do e-mail; o restante fica no painel. */
const maxItemsPerEmail = 20;
/** Pausa entre envios para respeitar o limite de taxa do Resend. */
const delayBetweenEmailsMs = 600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function emailHtml(name: string, opportunities: Opportunity[]) {
  const listed = opportunities.slice(0, maxItemsPerEmail);
  const remaining = opportunities.length - listed.length;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/dashboard` : null;

  const items = listed
    .map(
      (opportunity) => `
        <li style="margin:0 0 20px">
          <strong>${escapeHtml(opportunity.title)}</strong><br>
          ${escapeHtml(opportunity.organization)} · ${escapeHtml(opportunity.location)}<br>
          Propostas/inscrições até ${escapeHtml(formatDeadline(opportunity.deadline))}<br>
          <a href="${escapeHtml(opportunity.sourceUrl)}">Consultar fonte</a>
        </li>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#172f2b;line-height:1.6;max-width:620px;margin:auto">
      <h1 style="color:#1b7159">Novas oportunidades para você</h1>
      <p>Olá, ${escapeHtml(name)}. Encontramos ${opportunities.length} ${
        opportunities.length === 1 ? "oportunidade nova" : "oportunidades novas"
      } que combinam com seu perfil:</p>
      <ul>${items}</ul>
      ${
        remaining > 0
          ? `<p>E mais ${remaining} no seu painel${
              dashboardUrl
                ? `: <a href="${escapeHtml(dashboardUrl)}">abrir peneir.IA</a>`
                : "."
            }</p>`
          : ""
      }
      <p>Licitações são coletadas do Portal Nacional de Contratações Públicas (PNCP). Confirme sempre requisitos e prazos no edital oficial.</p>
      <p style="color:#64736e;font-size:12px">Você pode alterar seus alertas no seu perfil peneir.IA.</p>
    </div>`;
}

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
  const authUsers = new Map<string, { email: string | null; emailConfirmed: boolean }>();
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users) {
      authUsers.set(user.id, {
        email: user.email ?? null,
        emailConfirmed: Boolean(user.email_confirmed_at),
      });
    }
    if (data.users.length < perPage) break;
  }
  return authUsers;
}

async function loadAlertProfiles(supabase: ServiceClient) {
  const profiles: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "id" | "full_name" | "categories" | "keywords"
  >[] = [];
  for (let from = 0; ; from += readPageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, categories, keywords")
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

  const newSince = Date.now() - newOpportunityWindowMs;
  // Itens de demonstração aparecem no painel, mas nunca são enviados por e-mail.
  const newOpportunities = openOpportunities.filter(
    (opportunity) =>
      opportunity.source !== "demo" &&
      new Date(opportunity.firstSeenAt).getTime() >= newSince,
  );
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let emailsSent = 0;

  for (const profile of profiles) {
    const matches = getMatchingOpportunities(
      {
        categories: profile.categories,
        keywords: profile.keywords,
      },
      newOpportunities,
    );
    if (matches.length === 0) continue;

    const authUser = authUsers.get(profile.id);
    if (!authUser) {
      failed += 1;
      console.error("Could not find auth user for opportunity profile.", {
        userId: profile.id,
      });
      continue;
    }
    if (!authUser.email || !authUser.emailConfirmed) {
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

    if (emailsSent > 0) await sleep(delayBetweenEmailsMs);
    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: authUser.email,
      subject:
        claimed.length === 1
          ? `Nova oportunidade: ${claimed[0].title}`
          : `${claimed.length} novas oportunidades para você`,
      html: emailHtml(profile.full_name || "Olá", claimed),
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

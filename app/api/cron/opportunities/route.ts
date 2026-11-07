import { timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { NextResponse, type NextRequest } from "next/server";
import { getMatchingOpportunities, mockOpportunities } from "@/lib/opportunities";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Opportunity } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length &&
    timingSafeEqual(provided, expected)
  );
}

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
  const items = opportunities
    .map(
      (opportunity) => `
        <li style="margin:0 0 20px">
          <strong>${escapeHtml(opportunity.title)}</strong><br>
          ${escapeHtml(opportunity.organization)} · ${escapeHtml(opportunity.location)}<br>
          Inscrições até ${new Date(`${opportunity.deadline}T00:00:00`).toLocaleDateString("pt-BR")}<br>
          <a href="${escapeHtml(opportunity.sourceUrl)}">Consultar fonte</a>
        </li>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#172f2b;line-height:1.6;max-width:620px;margin:auto">
      <h1 style="color:#1b7159">Novas oportunidades para você</h1>
      <p>Olá, ${escapeHtml(name)}. Encontramos estas oportunidades recentes que combinam com seu perfil:</p>
      <ul>${items}</ul>
      <p>Estas oportunidades são dados de demonstração nesta fase. Confirme sempre as informações na fonte oficial.</p>
      <p style="color:#64736e;font-size:12px">Você pode alterar seus alertas no seu perfil peneir.IA.</p>
    </div>`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
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
  const perPage = 1000;
  const authUsers = new Map<
    string,
    { email: string | null; emailConfirmed: boolean }
  >();
  let page = 1;
  try {
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw error;

      for (const user of data.users) {
        authUsers.set(user.id, {
          email: user.email ?? null,
          emailConfirmed: Boolean(user.email_confirmed_at),
        });
      }
      if (data.users.length < perPage) break;
      page += 1;
    }
  } catch {
    console.error("Could not load Supabase Auth users for opportunity alerts.");
    return NextResponse.json(
      { error: "Não foi possível consultar as contas de autenticação." },
      { status: 502 },
    );
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, categories, keywords")
    .eq("email_alerts", true);
  if (profilesError) {
    console.error("Could not load profiles for opportunity alerts.", {
      error: profilesError.message,
    });
    return NextResponse.json(
      { error: "Não foi possível consultar os perfis." },
      { status: 502 },
    );
  }

  const recentOpportunities = mockOpportunities.filter(
    (opportunity) =>
      opportunity.deadline >= new Date().toISOString().slice(0, 10),
  );
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles) {
    const matches = getMatchingOpportunities(
      {
        categories: profile.categories,
        keywords: profile.keywords,
      },
      recentOpportunities,
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

    for (const opportunity of matches) {
      let claimed: boolean;
      try {
        const { data, error } = await supabase.rpc(
          "claim_opportunity_notification",
          {
            p_user_id: profile.id,
            p_opportunity_id: opportunity.id,
          },
        );
        if (error) throw error;
        claimed = data;
      } catch {
        failed += 1;
        console.error("Could not claim opportunity notification.", {
          userId: profile.id,
          opportunityId: opportunity.id,
        });
        continue;
      }
      if (!claimed) continue;

      const { error: emailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: authUser.email,
        subject: `Nova oportunidade: ${opportunity.title}`,
        html: emailHtml(profile.full_name || "Olá", [opportunity]),
      });

      if (emailError) {
        try {
          const { error } = await supabase
            .from("notification_deliveries")
            .update({
              status: "pending",
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", profile.id)
            .eq("opportunity_id", opportunity.id);
          if (error) throw error;
        } catch {
          console.error("Could not reset failed opportunity notification.", {
            userId: profile.id,
            opportunityId: opportunity.id,
          });
        }
        failed += 1;
        console.error("Opportunity email delivery failed.", {
          userId: profile.id,
          opportunityId: opportunity.id,
        });
        continue;
      }

      try {
        const sentAt = new Date().toISOString();
        const { error } = await supabase
          .from("notification_deliveries")
          .update({
            status: "sent",
            updated_at: sentAt,
            sent_at: sentAt,
          })
          .eq("user_id", profile.id)
          .eq("opportunity_id", opportunity.id);
        if (error) throw error;
      } catch {
        failed += 1;
        console.error("Email sent but delivery status could not be saved.", {
          userId: profile.id,
          opportunityId: opportunity.id,
        });
        continue;
      }
      sent += 1;
    }
  }

  if (failed > 0) {
    return NextResponse.json(
      { status: "partial_failure", sent, skipped, failed },
      { status: 502 },
    );
  }
  return NextResponse.json({ status: "complete", sent, skipped, failed });
}

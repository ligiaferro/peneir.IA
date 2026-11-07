import { timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { NextResponse, type NextRequest } from "next/server";
import { withServiceDb } from "@/lib/db";
import { getMatchingOpportunities, mockOpportunities } from "@/lib/opportunities";
import type { Opportunity, OpportunityCategory } from "@/lib/types";

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

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Configure DATABASE_URL com a URI PostgreSQL do Supabase." },
      { status: 503 },
    );
  }

  let profiles;
  try {
    const { rows } = await withServiceDb((database) =>
      database.query<{
        id: string;
        full_name: string;
        categories: OpportunityCategory[];
        keywords: string[];
        email: string | null;
        email_confirmed: boolean;
      }>(
        `SELECT p.id, p.full_name, p.categories, p.keywords, u.email,
                (u.email_confirmed_at IS NOT NULL) AS email_confirmed
         FROM public.profiles AS p
         JOIN auth.users AS u ON u.id = p.id
         WHERE p.email_alerts = true`,
      ),
    );
    profiles = rows;
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar os perfis." }, { status: 502 });
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
        categories: profile.categories as OpportunityCategory[],
        keywords: profile.keywords,
      },
      recentOpportunities,
    );
    if (matches.length === 0) continue;

    if (!profile.email || !profile.email_confirmed) {
      skipped += 1;
      continue;
    }

    for (const opportunity of matches) {
      let claimed: boolean;
      try {
        const { rows } = await withServiceDb((database) =>
          database.query<{ claimed: boolean }>(
            `SELECT public.claim_opportunity_notification($1::uuid, $2::text) AS claimed`,
            [profile.id, opportunity.id],
          ),
        );
        claimed = rows[0]?.claimed ?? false;
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
        to: profile.email,
        subject: `Nova oportunidade: ${opportunity.title}`,
        html: emailHtml(profile.full_name || "Olá", [opportunity]),
      });

      if (emailError) {
        try {
          await withServiceDb((database) =>
            database.query(
              `UPDATE public.notification_deliveries
               SET status = 'pending', updated_at = now()
               WHERE user_id = $1 AND opportunity_id = $2`,
              [profile.id, opportunity.id],
            ),
          );
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
        await withServiceDb((database) =>
          database.query(
            `UPDATE public.notification_deliveries
             SET status = 'sent', updated_at = now(), sent_at = now()
             WHERE user_id = $1 AND opportunity_id = $2`,
            [profile.id, opportunity.id],
          ),
        );
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

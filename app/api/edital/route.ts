import { after, NextResponse, type NextRequest } from "next/server";
import { processOpportunityEdital } from "@/lib/edital";
import { getOpportunityEdital } from "@/lib/edital-store";
import { getOpportunityById } from "@/lib/opportunity-store";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Download, extração de texto e leitura pela IA de editais grandes. */
export const maxDuration = 300;

async function authenticate() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : supabase;
}

/** Situação atual da leitura do edital (usada para acompanhar o processamento). */
export async function GET(request: NextRequest) {
  const supabase = await authenticate();
  if (!supabase) return NextResponse.json({ error: "Entre para continuar." }, { status: 401 });
  const opportunityId = request.nextUrl.searchParams.get("id") ?? "";
  if (!opportunityId) return NextResponse.json({ error: "Oportunidade inválida." }, { status: 400 });

  try {
    return NextResponse.json({ edital: await getOpportunityEdital(supabase, opportunityId) });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar o edital. Confira se a migração 0008 foi executada." },
      { status: 502 },
    );
  }
}

/**
 * Inicia a leitura do edital (uma vez; o resultado fica salvo para todos). A
 * leitura roda depois da resposta, com `after`, e o cliente acompanha com GET.
 */
export async function POST(request: NextRequest) {
  const supabase = await authenticate();
  if (!supabase) return NextResponse.json({ error: "Entre para continuar." }, { status: 401 });

  let opportunityId = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && "opportunityId" in body) {
      opportunityId = String(body.opportunityId);
    }
  } catch {
    // Tratado abaixo.
  }
  if (!opportunityId) return NextResponse.json({ error: "Oportunidade inválida." }, { status: 400 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "A leitura do edital por IA não está configurada (OPENAI_API_KEY)." },
      { status: 503 },
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Configure SUPABASE_SERVICE_ROLE_KEY para salvar a leitura do edital." },
      { status: 503 },
    );
  }

  const opportunity = await getOpportunityById(supabase, opportunityId).catch(() => null);
  if (!opportunity) {
    return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  }

  const admin = createServiceClient();
  const { data: claimed, error: claimError } = await admin.rpc("claim_edital_processing", {
    p_opportunity_id: opportunity.id,
  });
  if (claimError) {
    console.error("Could not claim edital processing.", { error: claimError.message });
    return NextResponse.json(
      { error: "Não foi possível iniciar a leitura. Confira se a migração 0008 foi executada." },
      { status: 502 },
    );
  }
  if (claimed) after(() => processOpportunityEdital(admin, opportunity));

  const edital = await getOpportunityEdital(supabase, opportunity.id).catch(() => null);
  return NextResponse.json({ edital }, { status: 202 });
}

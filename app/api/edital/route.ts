import { after, NextResponse, type NextRequest } from "next/server";
import { editalLimits, processOpportunityEdital } from "@/lib/edital";
import { getOpportunityEdital, getOpportunityEditais } from "@/lib/edital-store";
import { getOpportunityById } from "@/lib/opportunity-store";
import { sendOpportunityReportEmail } from "@/lib/report-email-send";
import {
  haveEditalFilesChanged,
  listPncpFiles,
  parsePncpOpportunityId,
} from "@/lib/sources/pncp-files";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Download, extração de texto e leitura pela IA de editais grandes. */
export const maxDuration = 300;

async function authenticate() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : { supabase, user: data.user };
}

/** Máximo de editais por consulta em lote. */
const maxBatchIds = 50;

/** Situação atual da leitura do edital (usada para acompanhar o processamento). */
export async function GET(request: NextRequest) {
  const session = await authenticate();
  if (!session) return NextResponse.json({ error: "Entre para continuar." }, { status: 401 });
  const idsParam = request.nextUrl.searchParams.get("ids");
  if (idsParam !== null) {
    // Consulta em lote (cards do painel): uma requisição para vários editais.
    const ids = [...new Set(idsParam.split(",").map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0 || ids.length > maxBatchIds) {
      return NextResponse.json({ error: "Lista de oportunidades inválida." }, { status: 400 });
    }
    try {
      const editais = await getOpportunityEditais(session.supabase, ids);
      return NextResponse.json({
        editais: Object.fromEntries(
          ids.map((id) => {
            const edital = editais.get(id);
            return [id, edital ? { status: edital.status, requirements: edital.requirements } : null];
          }),
        ),
      });
    } catch {
      return NextResponse.json({ error: "Não foi possível consultar os editais." }, { status: 502 });
    }
  }

  const opportunityId = request.nextUrl.searchParams.get("id") ?? "";
  if (!opportunityId) return NextResponse.json({ error: "Oportunidade inválida." }, { status: 400 });

  try {
    return NextResponse.json({
      edital: await getOpportunityEdital(session.supabase, opportunityId),
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar o edital. Confira se a migração 0008 foi executada." },
      { status: 502 },
    );
  }
}

/** Intervalo mínimo entre verificações de arquivos novos no PNCP. */
const recheckIntervalMs = 12 * 60 * 60 * 1000;

/**
 * Inicia a leitura do edital (uma vez; o resultado fica salvo para todos). A
 * leitura roda depois da resposta, com `after`, e o cliente acompanha com GET.
 * Com `check: true`, verifica se um edital já lido ganhou arquivos novos no
 * PNCP (retificação) e, nesse caso, relê. Com `notify: true` (leitura pedida
 * na página da vaga), envia o relatório da vaga por e-mail ao terminar.
 */
export async function POST(request: NextRequest) {
  const session = await authenticate();
  if (!session) return NextResponse.json({ error: "Entre para continuar." }, { status: 401 });
  const { supabase, user } = session;

  let opportunityId = "";
  let check = false;
  let force = false;
  let notify = false;
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && "opportunityId" in body) {
      opportunityId = String(body.opportunityId);
      check = "check" in body && body.check === true;
      notify = "notify" in body && body.notify === true;
      if ("force" in body) {
        if (typeof body.force !== "boolean") {
          return NextResponse.json({ error: "Opção de releitura inválida." }, { status: 400 });
        }
        force = body.force;
      }
    }
  } catch {
    // Tratado abaixo.
  }
  if (!opportunityId) return NextResponse.json({ error: "Oportunidade inválida." }, { status: 400 });

  if (!process.env.OPENAI_API_KEY) {
    console.error("Edital reading is unavailable: OPENAI_API_KEY is not configured.");
    return NextResponse.json(
      { error: "A leitura do edital por IA não está disponível no momento." },
      { status: 503 },
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Edital reading is unavailable: SUPABASE_SERVICE_ROLE_KEY is not configured.");
    return NextResponse.json(
      { error: "A leitura do edital não está disponível no momento." },
      { status: 503 },
    );
  }

  const opportunity = await getOpportunityById(supabase, opportunityId).catch(() => null);
  if (!opportunity) {
    return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  }

  const admin = createServiceClient();
  if (check) {
    return checkForUpdatedFiles(admin, supabase, opportunity);
  }
  const { data: claimed, error: claimError } = force
    ? await admin.rpc("claim_edital_reread", {
        p_opportunity_id: opportunity.id,
      })
    : await admin.rpc("claim_edital_processing", {
        p_opportunity_id: opportunity.id,
        p_force: false,
      });
  if (claimError) {
    console.error("Could not claim edital processing.", { error: claimError.message });
    return NextResponse.json(
      { error: "Não foi possível iniciar a leitura. Confira se as migrações do edital foram executadas." },
      { status: 502 },
    );
  }
  if (claimed) {
    after(async () => {
      await processOpportunityEdital(admin, opportunity);
      if (notify) {
        await sendOpportunityReportEmail({
          supabase,
          user,
          opportunityId: opportunity.id,
          trigger: "edital",
        });
      }
    });
  }

  const edital = await getOpportunityEdital(supabase, opportunity.id).catch(() => null);
  if (force && !claimed && edital?.status !== "processing") {
    return NextResponse.json(
      { error: "Só é possível refazer uma leitura do edital já concluída." },
      { status: 409 },
    );
  }
  return NextResponse.json({ edital }, { status: 202 });
}

type Opportunity = NonNullable<Awaited<ReturnType<typeof getOpportunityById>>>;

/** Relê o edital se o PNCP tiver publicado arquivos diferentes dos já lidos. */
async function checkForUpdatedFiles(
  admin: ReturnType<typeof createServiceClient>,
  supabase: NonNullable<Awaited<ReturnType<typeof authenticate>>>["supabase"],
  opportunity: Opportunity,
) {
  const { data: row } = await admin
    .from("opportunity_editais")
    .select("status, files, checked_at, processed_at")
    .eq("opportunity_id", opportunity.id)
    .maybeSingle();
  const lastCheck = row?.checked_at ?? row?.processed_at;
  const due =
    row &&
    (row.status === "ready" || row.status === "no_text") &&
    (!lastCheck || Date.now() - new Date(lastCheck).getTime() > recheckIntervalMs);
  if (due) {
    await admin
      .from("opportunity_editais")
      .update({ checked_at: new Date().toISOString() })
      .eq("opportunity_id", opportunity.id);
    try {
      const key = parsePncpOpportunityId(opportunity.id);
      const latest = key ? await listPncpFiles(key) : [];
      const previousUrls = Array.isArray(row.files)
        ? row.files.flatMap((file) =>
            typeof file === "object" && file !== null && "url" in file && typeof file.url === "string"
              ? [file.url]
              : [],
          )
        : [];
      if (latest.length > 0 && haveEditalFilesChanged(previousUrls, latest, editalLimits.files)) {
        const { data: claimed } = await admin.rpc("claim_edital_processing", {
          p_opportunity_id: opportunity.id,
          p_force: true,
        });
        if (claimed) after(() => processOpportunityEdital(admin, opportunity));
      }
    } catch (error) {
      console.error("Could not check PNCP files for an updated edital.", {
        opportunityId: opportunity.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const edital = await getOpportunityEdital(supabase, opportunity.id).catch(() => null);
  return NextResponse.json({ edital });
}

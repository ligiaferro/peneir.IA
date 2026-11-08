import { NextResponse, type NextRequest } from "next/server";
import { linkColumns } from "@/lib/document-report";
import { getAcceptedRequirements } from "@/lib/edital-store";
import { createClient } from "@/lib/supabase/server";

type LinkRequest = {
  documentId: string;
  opportunityId: string;
  requirement: string;
};

function isLinkRequest(value: unknown): value is LinkRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "documentId" in value &&
    typeof value.documentId === "string" &&
    "opportunityId" in value &&
    typeof value.opportunityId === "string" &&
    "requirement" in value &&
    typeof value.requirement === "string"
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Entre para reutilizar documentos." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Envie um pedido JSON válido." }, { status: 400 });
  }
  if (!isLinkRequest(body)) {
    return NextResponse.json({ error: "Documento, oportunidade ou requisito inválido." }, { status: 400 });
  }

  const requirement = body.requirement.trim();
  if (!requirement || requirement.length > 500) {
    return NextResponse.json({ error: "Requisito inválido." }, { status: 400 });
  }

  const [documentResult, opportunityResult] = await Promise.all([
    supabase
      .from("documents")
      .select("id, user_id, opportunity_id, name, document_type, expires_at, storage_path, created_at")
      .eq("id", body.documentId)
      .eq("user_id", authData.user.id)
      .maybeSingle(),
    supabase
      .from("opportunities")
      .select("id, requirements")
      .eq("id", body.opportunityId)
      .maybeSingle(),
  ]);
  if (documentResult.error || opportunityResult.error) {
    return NextResponse.json({ error: "Não foi possível validar o documento e a oportunidade." }, { status: 502 });
  }
  if (!documentResult.data) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  if (!opportunityResult.data) {
    return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  }
  if (
    documentResult.data.expires_at &&
    documentResult.data.expires_at < new Date().toISOString().slice(0, 10)
  ) {
    return NextResponse.json(
      { error: "Documentos com validade vencida não podem ser reutilizados." },
      { status: 400 },
    );
  }
  const requirements = await getAcceptedRequirements(
    supabase,
    opportunityResult.data.id,
    opportunityResult.data.requirements,
  );
  const validRequirement =
    requirements.includes(requirement) ||
    (requirements.length === 0 && requirement === "Documento complementar");
  if (!validRequirement) {
    return NextResponse.json(
      { error: "O requisito não pertence a esta oportunidade." },
      { status: 400 },
    );
  }

  const { data: association, error: associationError } = await supabase
    .from("document_opportunities")
    .upsert(
      {
        user_id: authData.user.id,
        document_id: body.documentId,
        opportunity_id: body.opportunityId,
        requirement,
      },
      { onConflict: "document_id,opportunity_id,requirement" },
    )
    .select(linkColumns)
    .single();
  if (associationError) {
    console.error("Could not link a document to an opportunity.", {
      userId: authData.user.id,
      error: associationError.message,
    });
    return NextResponse.json({ error: "Não foi possível associar o documento." }, { status: 502 });
  }

  return NextResponse.json({ association }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Entre para desvincular documentos." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Envie um pedido JSON válido." }, { status: 400 });
  }
  if (!isLinkRequest(body)) {
    return NextResponse.json({ error: "Documento, oportunidade ou requisito inválido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("document_opportunities")
    .delete()
    .eq("user_id", authData.user.id)
    .eq("document_id", body.documentId)
    .eq("opportunity_id", body.opportunityId)
    .eq("requirement", body.requirement)
    .select("document_id");
  if (error) {
    return NextResponse.json({ error: "Não foi possível desvincular o documento." }, { status: 502 });
  }
  if (data.length === 0) {
    return NextResponse.json({ error: "Vínculo de documento não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

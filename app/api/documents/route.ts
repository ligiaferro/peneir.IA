import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserDocument } from "@/lib/types";

const maxFileSize = 4 * 1024 * 1024;

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Entre para enviar documentos." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envie um formulário válido." }, { status: 400 });
  }
  const file = formData.get("file");
  const documentType = String(formData.get("document_type") ?? "").trim();
  const expiresAt = String(formData.get("expires_at") ?? "").trim();
  const opportunityId = String(formData.get("opportunity_id") ?? "").trim();
  if (!(file instanceof File) || !documentType || !opportunityId) {
    return NextResponse.json(
      { error: "Selecione uma oportunidade, um PDF e informe o tipo de documento." },
      { status: 400 },
    );
  }
  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select("id")
    .eq("id", opportunityId)
    .maybeSingle();
  if (opportunityError) {
    return NextResponse.json(
      { error: "Não foi possível validar a oportunidade selecionada." },
      { status: 502 },
    );
  }
  if (!opportunity) {
    return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  }
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Envie somente arquivos PDF." }, { status: 400 });
  }
  if (file.size === 0 || file.size > maxFileSize) {
    return NextResponse.json(
      { error: "O arquivo deve ter conteúdo e no máximo 4 MB." },
      { status: 400 },
    );
  }
  if (documentType.length > 500) {
    return NextResponse.json({ error: "Tipo de documento muito longo." }, { status: 400 });
  }
  if (expiresAt && !isCalendarDate(expiresAt)) {
    return NextResponse.json({ error: "Informe uma data de validade válida." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "O arquivo enviado não parece ser um PDF válido." }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-120) || "documento.pdf";
  const storagePath = `${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: "Não foi possível armazenar o documento privado." },
      { status: 502 },
    );
  }

  let document: UserDocument | undefined;
  try {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        user_id: authData.user.id,
        opportunity_id: opportunityId,
        name: safeName,
        document_type: documentType,
        expires_at: expiresAt || null,
        storage_path: storagePath,
      })
      .select(
        "id, user_id, opportunity_id, name, document_type, expires_at, storage_path, created_at",
      )
      .single();
    if (error) throw error;
    document = data;
  } catch {
    const { error: cleanupError } = await supabase.storage
      .from("documents")
      .remove([storagePath]);
    if (cleanupError) {
      console.error("Document cleanup failed after database insert error.", {
        userId: authData.user.id,
      });
    }
    return NextResponse.json(
      { error: "Não foi possível registrar o documento no banco de dados." },
      { status: 502 },
    );
  }
  if (!document) {
    const { error: cleanupError } = await supabase.storage
      .from("documents")
      .remove([storagePath]);
    if (cleanupError) {
      console.error("Document cleanup failed after metadata insert error.", {
        userId: authData.user.id,
      });
    }
    return NextResponse.json(
      { error: "O arquivo foi recebido, mas não foi possível registrar seus dados." },
      { status: 502 },
    );
  }

  return NextResponse.json({ document }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Entre para editar documentos." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Envie um pedido JSON válido." }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("documentId" in body) ||
    typeof body.documentId !== "string" ||
    !("documentType" in body) ||
    typeof body.documentType !== "string" ||
    !("expiresAt" in body) ||
    !(typeof body.expiresAt === "string" || body.expiresAt === null)
  ) {
    return NextResponse.json({ error: "Dados do documento inválidos." }, { status: 400 });
  }

  const documentType = body.documentType.trim();
  const expiresAt = body.expiresAt?.trim() ?? "";
  if (!documentType || documentType.length > 500) {
    return NextResponse.json(
      { error: "Informe um tipo de documento com até 500 caracteres." },
      { status: 400 },
    );
  }
  if (expiresAt && !isCalendarDate(expiresAt)) {
    return NextResponse.json({ error: "Informe uma data de validade válida." }, { status: 400 });
  }

  const { data: document, error } = await supabase
    .from("documents")
    .update({ document_type: documentType, expires_at: expiresAt || null })
    .eq("id", body.documentId)
    .eq("user_id", authData.user.id)
    .select("id, user_id, opportunity_id, name, document_type, expires_at, storage_path, created_at")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Não foi possível atualizar o documento." }, { status: 502 });
  }
  if (!document) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ document });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Entre para remover documentos." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Envie um pedido JSON válido." }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("documentId" in body) ||
    typeof body.documentId !== "string"
  ) {
    return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  }

  let document: { id: string; storage_path: string } | undefined;
  try {
    const { data, error } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("id", body.documentId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (error) throw error;
    document = data ?? undefined;
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o banco de dados." }, { status: 502 });
  }
  if (!document) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([document.storage_path]);
  if (storageError) {
    return NextResponse.json({ error: "Não foi possível remover o arquivo privado." }, { status: 502 });
  }
  let deletedDocuments: { id: string }[] | null;
  try {
    const { data, error } = await supabase
      .from("documents")
      .delete()
      .eq("id", document.id)
      .eq("user_id", authData.user.id)
      .select("id");
    if (error) throw error;
    deletedDocuments = data;
  } catch {
    return NextResponse.json(
      { error: "O arquivo foi removido, mas não foi possível atualizar o banco." },
      { status: 502 },
    );
  }
  if (deletedDocuments?.length !== 1) {
    return NextResponse.json({ error: "O arquivo foi removido, mas os dados não puderam ser atualizados." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}

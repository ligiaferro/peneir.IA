import { NextResponse, type NextRequest } from "next/server";
import { withUserDb } from "@/lib/db";
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
  if (!(file instanceof File) || !documentType) {
    return NextResponse.json(
      { error: "Selecione um PDF e informe o tipo de documento." },
      { status: 400 },
    );
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
  if (documentType.length > 60) {
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
    const { rows } = await withUserDb(authData.user.id, (database) =>
      database.query<UserDocument>(
        `INSERT INTO public.documents
           (user_id, name, document_type, expires_at, storage_path)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, name, document_type, expires_at::text AS expires_at,
                   storage_path, created_at::text AS created_at`,
        [
          authData.user.id,
          safeName,
          documentType,
          expiresAt || null,
          storagePath,
        ],
      ),
    );
    document = rows[0];
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
    const { rows } = await withUserDb(authData.user.id, (database) =>
      database.query<{ id: string; storage_path: string }>(
        `SELECT id, storage_path
         FROM public.documents
         WHERE id = $1 AND user_id = $2`,
        [body.documentId, authData.user.id],
      ),
    );
    document = rows[0];
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
  let rowCount: number | null;
  try {
    ({ rowCount } = await withUserDb(authData.user.id, (database) =>
      database.query(
        `DELETE FROM public.documents
         WHERE id = $1 AND user_id = $2`,
        [document.id, authData.user.id],
      ),
    ));
  } catch {
    return NextResponse.json(
      { error: "O arquivo foi removido, mas não foi possível atualizar o banco." },
      { status: 502 },
    );
  }
  if (rowCount !== 1) {
    return NextResponse.json({ error: "O arquivo foi removido, mas os dados não puderam ser atualizados." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}

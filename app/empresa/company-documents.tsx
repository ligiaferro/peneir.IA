"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserDocument } from "@/lib/types";

export type CompanyDocument = UserDocument & {
  opportunities: Array<{
    id: string;
    title: string;
    source_url: string;
    requirements: string[];
    /** Algum vínculo com esta oportunidade foi criado pela IA. */
    addedByAi: boolean;
  }>;
};

export function CompanyDocuments({
  initialDocuments,
}: {
  initialDocuments: CompanyDocument[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [editingId, setEditingId] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const sourceData = new FormData(form);
    const files = sourceData
      .getAll("file")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      setUploadError("Selecione ao menos um PDF.");
      return;
    }
    const expiresAtValue = sourceData.get("expires_at");

    setUploading(true);
    setUploadError("");
    setUploadNotice("");

    const uploaded: UserDocument[] = [];
    const uploadErrors: string[] = [];
    const uploadWarnings: string[] = [];
    try {
      // Envia um arquivo por vez: a API só aceita um PDF por requisição.
      for (const [index, file] of files.entries()) {
        if (files.length > 1) {
          setUploadNotice(`Enviando ${index + 1} de ${files.length}...`);
        }
        const fileData = new FormData();
        fileData.set("file", file);
        fileData.set("expires_at", expiresAtValue ?? "");
        try {
          const response = await fetch("/api/documents", {
            method: "POST",
            body: fileData,
          });
          const result = (await response.json()) as {
            document?: UserDocument;
            warning?: string;
            error?: string;
          };
          if (!response.ok || !result.document) {
            uploadErrors.push(
              `${file.name}: ${result.error ?? "não foi possível enviar."}`,
            );
            continue;
          }
          uploaded.push(result.document);
          if (result.warning) {
            uploadWarnings.push(`${file.name}: ${result.warning}`);
          }
        } catch {
          uploadErrors.push(`${file.name}: falha de conexão.`);
        }
      }

      if (uploaded.length > 0) {
        setDocuments((current) => [
          ...uploaded.map((document) => ({ ...document, opportunities: [] })),
          ...current,
        ]);
        uploadFormRef.current?.reset();
        router.refresh();
      }
      if (uploadErrors.length > 0) {
        setUploadError(uploadErrors.join(" "));
      }
      if (uploaded.length > 0) {
        const summary = `${uploaded.length > 1 ? `${uploaded.length} documentos salvos` : "Documento salvo"} no arquivo da empresa.`;
        const typeMessage =
          uploadWarnings.length > 0
            ? uploadWarnings.join(" ")
            : "A IA identificou o tipo de cada PDF; você pode revisá-lo em “Editar dados”.";
        setUploadNotice(
          `${summary} ${typeMessage}`,
        );
      }
    } finally {
      setUploading(false);
    }
  }

  function startEditing(document: CompanyDocument) {
    setEditingId(document.id);
    setDocumentType(document.document_type);
    setExpiresAt(document.expires_at ?? "");
    setError("");
  }

  async function saveDocument(documentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, documentType, expiresAt }),
      });
      const result = (await response.json()) as {
        document?: UserDocument;
        error?: string;
      };
      if (!response.ok || !result.document) {
        setError(result.error ?? "Não foi possível atualizar o documento.");
        return;
      }
      setDocuments((current) =>
        current.map((document) =>
          document.id === documentId
            ? { ...document, ...result.document }
            : document,
        ),
      );
      setEditingId("");
      router.refresh();
    } catch {
      setError("Falha de conexão ao atualizar o documento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(documentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Não foi possível remover o documento.");
        return;
      }
      setDocuments((current) =>
        current.filter((document) => document.id !== documentId),
      );
      router.refresh();
    } catch {
      setError("Falha de conexão ao remover o documento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form ref={uploadFormRef} className="company-document-upload" onSubmit={uploadDocument}>
        <h3>Adicionar documentos ao arquivo</h3>
        <div className="field">
          <label htmlFor="company-document-file">PDF (até 4 MB cada)</label>
          <input
            id="company-document-file"
            className="input"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            required
          />
          <p className="field-hint">
            Selecione vários PDFs. A IA identifica o tipo de cada um, que pode
            ser revisado depois em “Editar dados”.
          </p>
        </div>
        <div className="field">
          <label htmlFor="company-document-expiry">Validade (se houver)</label>
          <input id="company-document-expiry" name="expires_at" type="date" />
        </div>
        <button className="button button-small" type="submit" disabled={uploading}>
          {uploading ? "Enviando..." : "Adicionar ao arquivo"}
        </button>
        {uploadError && <p className="notice notice-error">{uploadError}</p>}
        {uploadNotice && <p className="notice">{uploadNotice}</p>}
      </form>

      {error && <p className="notice notice-error">{error}</p>}
      {documents.length === 0 ? (
        <div className="empty-state">
          Ainda não há documentos no arquivo. Adicione acima os documentos da
          empresa (CNPJ, certidões, balanço, atestados…) ou envie-os dentro de
          uma oportunidade: em ambos os casos eles ficam aqui e a IA pode
          usá-los em todos os editais.
        </div>
      ) : (
        <div className="document-list">
          {documents.map((document) => (
            <article className="company-document" key={document.id}>
              <div className="document-row">
                <div style={{ minWidth: 0 }}>
                  <div className="document-name">{document.name}</div>
                  <div className="document-meta">
                    {document.document_type}
                    {document.expires_at
                      ? ` · validade ${new Date(
                          `${document.expires_at}T00:00:00`,
                        ).toLocaleDateString("pt-BR")}`
                      : " · validade não informada"}
                  </div>
                  <div className="document-meta">
                    Enviado em{" "}
                    {new Date(document.created_at).toLocaleDateString("pt-BR")}
                  </div>
                  {document.opportunities.length > 0 ? (
                    <ul className="company-document-opportunities">
                      {document.opportunities.map((opportunity) => (
                        <li key={opportunity.id}>
                          <Link
                            href={`/oportunidade?id=${encodeURIComponent(opportunity.id)}`}
                          >
                            {opportunity.title}
                          </Link>
                          {opportunity.addedByAi && (
                            <>
                              {" "}
                              <span className="fit-badge fit-badge-ai">Vinculado pela IA</span>
                            </>
                          )}
                          {opportunity.requirements.length > 0 && (
                            <span className="document-meta">
                              {" "}
                              · {opportunity.requirements.join("; ")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="document-meta">
                      No arquivo da empresa, ainda sem oportunidade associada.
                    </div>
                  )}
                </div>
                <div className="document-actions">
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    disabled={busy}
                    onClick={() => startEditing(document)}
                  >
                    Editar dados
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    disabled={busy}
                    onClick={() => removeDocument(document.id)}
                  >
                    Remover
                  </button>
                </div>
              </div>
              {editingId === document.id && (
                <div className="company-document-editor">
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor={`type-${document.id}`}>Tipo</label>
                      <input
                        id={`type-${document.id}`}
                        value={documentType}
                        maxLength={500}
                        required
                        onChange={(event) => setDocumentType(event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`expiry-${document.id}`}>Validade</label>
                      <input
                        id={`expiry-${document.id}`}
                        type="date"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="document-actions">
                    <button
                      className="button button-small"
                      type="button"
                      disabled={busy}
                      onClick={() => saveDocument(document.id)}
                    >
                      {busy ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingId("")}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

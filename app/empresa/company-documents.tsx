"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserDocument } from "@/lib/types";

export type CompanyDocument = UserDocument & {
  opportunities: Array<{
    id: string;
    title: string;
    source_url: string;
    requirements: string[];
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
  const router = useRouter();

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
      {error && <p className="notice notice-error">{error}</p>}
      {documents.length === 0 ? (
        <div className="empty-state">
          Ainda não há documentos enviados. Envie os PDFs dentro de cada
          oportunidade para que eles apareçam nesta página.
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
                          <a
                            href={opportunity.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {opportunity.title}
                          </a>
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
                      Sem oportunidade associada.
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

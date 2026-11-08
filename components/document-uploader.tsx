"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  UserDocument,
  UserDocumentOpportunityLink,
} from "@/lib/types";
import type { DocumentSuggestion } from "@/lib/document-matching";

type Props = {
  opportunityId: string;
  fieldId: string;
  requirement: string;
  documents: UserDocument[];
  suggestions: DocumentSuggestion<UserDocument>[];
  /** Outros documentos válidos do usuário, para escolher manualmente. */
  reusableDocuments?: UserDocument[];
  onUploaded: (
    document: UserDocument,
    association: UserDocumentOpportunityLink,
  ) => void;
  onLinked: (
    document: UserDocument,
    association: UserDocumentOpportunityLink,
  ) => void;
  onUnlinked: (documentId: string) => void;
};

export function DocumentUploader({
  opportunityId,
  fieldId,
  requirement,
  documents,
  suggestions,
  reusableDocuments = [],
  onUploaded,
  onLinked,
  onUnlinked,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const router = useRouter();
  const selectedDocument = reusableDocuments.find(
    (document) => document.id === selectedDocumentId,
  );

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result = (await response.json()) as {
        document?: UserDocument;
        association?: UserDocumentOpportunityLink;
        error?: string;
      };
      if (!response.ok || !result.document || !result.association) {
        setError(result.error ?? "Não foi possível enviar o documento.");
        return;
      }

      onUploaded(result.document, result.association);
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError("Falha de conexão ao enviar o documento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function reuseDocument(document: UserDocument) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/document-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          opportunityId,
          requirement,
        }),
      });
      const result = (await response.json()) as {
        association?: UserDocumentOpportunityLink;
        error?: string;
      };
      if (!response.ok || !result.association) {
        setError(result.error ?? "Não foi possível reutilizar o documento.");
        return;
      }
      onLinked(document, result.association);
      router.refresh();
    } catch {
      setError("Falha de conexão ao reutilizar o documento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkDocument(documentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/document-opportunities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, opportunityId, requirement }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Não foi possível desvincular o documento.");
        return;
      }
      onUnlinked(documentId);
      router.refresh();
    } catch {
      setError("Falha de conexão ao desvincular o documento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="requirement-upload">
      {suggestions.length > 0 && (
        <div className="document-suggestions">
          <span className="field-label">Sugestões dos seus documentos</span>
          <p className="field-hint">
            Compatibilidade estimada pelo nome e tipo. Confira o conteúdo antes
            de reutilizar.
          </p>
          <div className="suggestion-options">
            {suggestions.slice(0, 5).map((suggestion) => (
              <div className="document-suggestion" key={suggestion.document.id}>
                <div>
                  <div className="document-name">{suggestion.document.name}</div>
                  <div className="document-meta">
                    {suggestion.document.document_type} · termos em comum:{" "}
                    {suggestion.matchingTerms.join(", ")}
                  </div>
                </div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  disabled={busy}
                  onClick={() => reuseDocument(suggestion.document)}
                >
                  {busy ? "Vinculando..." : "Usar documento"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {reusableDocuments.length > 0 && (
        <div className="document-reuse">
          <label className="field-label" htmlFor={`reuse-${fieldId}`}>
            Reutilizar um documento já enviado
          </label>
          <div className="document-reuse-row">
            <select
              id={`reuse-${fieldId}`}
              className="input"
              value={selectedDocumentId}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
            >
              <option value="">Escolha um documento…</option>
              {reusableDocuments.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.name} — {document.document_type}
                </option>
              ))}
            </select>
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={busy || !selectedDocument}
              onClick={() => {
                if (!selectedDocument) return;
                setSelectedDocumentId("");
                void reuseDocument(selectedDocument);
              }}
            >
              Usar
            </button>
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div className="document-list">
          {documents.map((document) => (
            <div className="document-row" key={document.id}>
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
              </div>
              <button
                className="button button-secondary button-small"
                type="button"
                disabled={busy}
                onClick={() => unlinkDocument(document.id)}
              >
                Desvincular
              </button>
            </div>
          ))}
        </div>
      )}

      <form ref={formRef} onSubmit={uploadDocument}>
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input type="hidden" name="document_type" value={requirement} />
        <div className="field">
          <label htmlFor={`file-${fieldId}`}>Ou envie um novo PDF (até 4 MB)</label>
          <input
            id={`file-${fieldId}`}
            className="input"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`expiry-${fieldId}`}>Validade (se conhecida)</label>
            <input id={`expiry-${fieldId}`} name="expires_at" type="date" />
          </div>
          <div className="requirement-upload-action">
            <button className="button button-small" disabled={busy} type="submit">
              {busy ? "Enviando..." : "Enviar documento"}
            </button>
          </div>
        </div>
      </form>

      {error && <p className="notice notice-error">{error}</p>}
    </div>
  );
}

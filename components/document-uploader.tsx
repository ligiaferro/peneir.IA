"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { UserDocument } from "@/lib/types";

type Props = {
  opportunityId: string;
  fieldId: string;
  requirement: string;
  documents: UserDocument[];
  onChange: (documents: UserDocument[]) => void;
};

export function DocumentUploader({
  opportunityId,
  fieldId,
  requirement,
  documents,
  onChange,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

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
        error?: string;
      };
      if (!response.ok || !result.document) {
        setError(result.error ?? "Não foi possível enviar o documento.");
        return;
      }

      onChange([...documents, result.document]);
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError("Falha de conexão ao enviar o documento. Tente novamente.");
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
      onChange(documents.filter((document) => document.id !== documentId));
      router.refresh();
    } catch {
      setError("Falha de conexão ao remover o documento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="requirement-upload">
      <form ref={formRef} onSubmit={uploadDocument}>
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input type="hidden" name="document_type" value={requirement} />
        <div className="field">
          <label htmlFor={`file-${fieldId}`}>Arquivo PDF (até 4 MB)</label>
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
      {documents.length > 0 && (
        <div className="document-list">
          {documents.map((document) => (
            <div className="document-row" key={document.id}>
              <div style={{ minWidth: 0 }}>
                <div className="document-name">{document.name}</div>
                <div className="document-meta">
                  {document.expires_at
                    ? `Validade ${new Date(
                        `${document.expires_at}T00:00:00`,
                      ).toLocaleDateString("pt-BR")}`
                    : "Validade não informada"}
                </div>
              </div>
              <button
                className="button button-secondary button-small"
                type="button"
                disabled={busy}
                onClick={() => removeDocument(document.id)}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useRef, useState, type FormEvent } from "react";
import type { UserDocument } from "@/lib/types";

type Props = {
  documents: UserDocument[];
  onChange: (documents: UserDocument[]) => void;
};

export function DocumentUploader({ documents, onChange }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

      onChange([result.document, ...documents]);
      formRef.current?.reset();
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
    } catch {
      setError("Falha de conexão ao remover o documento. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form ref={formRef} onSubmit={uploadDocument}>
        <div className="field">
          <label htmlFor="document">Arquivo PDF (até 4 MB)</label>
          <input
            id="document"
            className="input"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="document_type">Tipo de documento</label>
            <input
              id="document_type"
              name="document_type"
              placeholder="ex.: certidão, diploma, currículo"
              maxLength={60}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="expires_at">Validade (se conhecida)</label>
            <input id="expires_at" name="expires_at" type="date" />
          </div>
        </div>
        <button className="button button-small" disabled={busy} type="submit">
          {busy ? "Processando..." : "Adicionar documento"}
        </button>
      </form>

      {error && <p className="notice notice-error">{error}</p>}
      <div className="document-list">
        {documents.length === 0 ? (
          <div className="empty-state">
            Seus arquivos ficam privados. Envie um PDF quando quiser compará-lo
            com os requisitos de uma oportunidade.
          </div>
        ) : (
          documents.map((document) => (
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
                onClick={() => removeDocument(document.id)}
              >
                Remover
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

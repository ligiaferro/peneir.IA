"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { categoryLabels } from "@/lib/opportunities";
import type {
  AnalysisResult,
  Opportunity,
  UserDocument,
} from "@/lib/types";

type AnalysisRecord = {
  document_id: string;
  result: AnalysisResult;
};

export function OpportunityCard({
  opportunity,
  documents,
  initialAnalyses,
}: {
  opportunity: Opportunity;
  documents: UserDocument[];
  initialAnalyses: AnalysisRecord[];
}) {
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const currentAnalysis = useMemo(
    () => analyses.find((analysis) => analysis.document_id === documentId),
    [analyses, documentId],
  );

  async function analyze() {
    if (!documentId) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          documentId,
        }),
      });
      const result = (await response.json()) as {
        analysis?: AnalysisResult;
        error?: string;
      };
      if (!response.ok || !result.analysis) {
        setError(result.error ?? "Não foi possível analisar o documento.");
        return;
      }
      setAnalyses((current) => [
        ...current.filter((item) => item.document_id !== documentId),
        { document_id: documentId, result: result.analysis! },
      ]);
      router.refresh();
    } catch {
      setError("Falha de conexão ao analisar. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="opportunity-card">
      <div className="card-topline">
        <span className="badge">{categoryLabels[opportunity.category]}</span>
        <span className="card-date">
          Publicado{" "}
          {new Date(opportunity.publishedAt).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <h3>{opportunity.title}</h3>
      <p className="organization">
        {opportunity.organization} · {opportunity.location}
      </p>
      <p className="opportunity-summary">{opportunity.summary}</p>
      <span className="field-label">Requisitos informados no edital</span>
      <ul className="requirements">
        {opportunity.requirements.map((requirement) => (
          <li key={requirement}>{requirement}</li>
        ))}
      </ul>
      <div className="card-footer">
        <span>
          Inscrições até{" "}
          {new Date(`${opportunity.deadline}T00:00:00`).toLocaleDateString(
            "pt-BR",
          )}
        </span>
        <a
          className="button button-secondary button-small"
          href={opportunity.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ver fonte ↗
        </a>
      </div>

      <div className="analysis-box">
        <h4>Compare um documento com esta oportunidade</h4>
        {documents.length === 0 ? (
          <p>Adicione um PDF na seção “Meus documentos” para iniciar a análise.</p>
        ) : (
          <div className="form-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`doc-${opportunity.id}`}>Documento</label>
              <select
                id={`doc-${opportunity.id}`}
                className="input"
                value={documentId}
                onChange={(event) => setDocumentId(event.target.value)}
              >
                {documents.map((document) => (
                  <option value={document.id} key={document.id}>
                    {document.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button
                className="button button-small"
                type="button"
                disabled={pending || !documentId}
                onClick={analyze}
              >
                {pending ? "Analisando..." : "Analisar com IA"}
              </button>
            </div>
          </div>
        )}
        {error && <p className="notice notice-error">{error}</p>}
        {currentAnalysis && <AnalysisDetails result={currentAnalysis.result} />}
        <p className="fine-print">
          A IA pode errar. Confira os requisitos no edital original antes de
          tomar qualquer decisão.
        </p>
      </div>
    </article>
  );
}

function AnalysisDetails({ result }: { result: AnalysisResult }) {
  return (
    <div>
      <p>{result.documentSummary}</p>
      {result.extractedExpiryDate && (
        <p>
          Validade identificada:{" "}
          {new Date(
            `${result.extractedExpiryDate}T00:00:00`,
          ).toLocaleDateString("pt-BR")}
        </p>
      )}
      {result.requirements.length > 0 && (
        <ul>
          {result.requirements.map((item, index) => (
            <li key={`${item.requirement}-${index}`}>
              <span className="analysis-status">{statusLabel(item.status)}</span>
              {item.requirement}
              {item.evidence && ` — ${item.evidence}`}
            </li>
          ))}
        </ul>
      )}
      {result.issues.map((issue, index) => (
        <p className="analysis-review" key={`issue-${index}`}>
          Atenção: {issue}
        </p>
      ))}
      {result.reviewNotes.map((note, index) => (
        <p className="analysis-review" key={`note-${index}`}>
          Revisar: {note}
        </p>
      ))}
    </div>
  );
}

function statusLabel(status: AnalysisResult["requirements"][number]["status"]) {
  const labels = {
    atende: "Possível correspondência:",
    parcial: "Correspondência parcial:",
    nao_atende: "Possível pendência:",
    inconclusivo: "Não foi possível confirmar:",
  };
  return labels[status];
}

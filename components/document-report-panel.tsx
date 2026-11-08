"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setAiConsentAction } from "@/app/actions";
import {
  documentFitLabels,
  documentReportNoteLabels,
  sortReportDocuments,
  type OpportunityDocumentReport,
} from "@/lib/document-report";
import { formatDate } from "@/lib/format";
import type { UserDocumentOpportunityLink } from "@/lib/types";

const pollIntervalMs = 4_000;
const maxPollMs = 5 * 60 * 1000;

type ReportResponse = {
  report?: OpportunityDocumentReport | null;
  links?: UserDocumentOpportunityLink[];
  error?: string;
};

/**
 * Relatório da IA: como cada documento do arquivo da empresa se encaixa nas
 * exigências do edital. Gera automaticamente quando o edital está lido, há
 * consentimento e o relatório não existe ou ficou desatualizado.
 */
export function DocumentReportPanel({
  opportunityId,
  canGenerate,
  documentsCount,
  initialReport,
  isStale,
  aiConsent,
  onConsentGranted,
  onLinksChanged,
}: {
  opportunityId: string;
  /** O edital foi lido e tem exigências identificadas. */
  canGenerate: boolean;
  documentsCount: number;
  initialReport: OpportunityDocumentReport | null;
  /** Edital ou documentos mudaram desde o último relatório. */
  isStale: boolean;
  aiConsent: boolean;
  onConsentGranted: () => void;
  onLinksChanged: (links: UserDocumentOpportunityLink[]) => void;
}) {
  const [report, setReport] = useState(initialReport);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    setReport(initialReport);
    setRefreshed(false);
  }, [initialReport]);

  const poll = useCallback(async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < maxPollMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const response = await fetch(`/api/document-report?id=${encodeURIComponent(opportunityId)}`);
      const result = (await response.json()) as ReportResponse;
      if (!response.ok) throw new Error(result.error ?? "Não foi possível consultar o relatório.");
      if (result.report?.status !== "processing") return result;
    }
    throw new Error("O relatório está demorando mais que o esperado. Recarregue a página em instantes.");
  }, [opportunityId]);

  const generate = useCallback(
    async (force: boolean) => {
      setWorking(true);
      setError("");
      try {
        const response = await fetch("/api/document-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId, force }),
        });
        const result = (await response.json()) as ReportResponse;
        if (!response.ok) {
          setError(result.error ?? "Não foi possível gerar o relatório dos documentos.");
          return;
        }
        const final =
          response.status === 202 || result.report?.status === "processing"
            ? await poll()
            : result;
        const current = final.report ?? null;
        if (final.links) onLinksChanged(final.links);
        setReport(current);
        setRefreshed(true);
        if (current?.status === "failed") setError(current.error ?? "O relatório falhou.");
      } catch (caught) {
        setError(
          caught instanceof Error && caught.message
            ? caught.message
            : "Falha de conexão ao gerar o relatório. Tente novamente.",
        );
      } finally {
        setWorking(false);
      }
    },
    [onLinksChanged, opportunityId, poll],
  );

  async function grantConsentAndGenerate() {
    setError("");
    const consentResult = await setAiConsentAction(true);
    if (consentResult.error) {
      setError(consentResult.error);
      return;
    }
    onConsentGranted();
    attempted.current = true;
    await generate(false);
  }

  // Geração automática, uma vez por visita à página.
  useEffect(() => {
    if (attempted.current || working) return;
    if (!aiConsent || !canGenerate || documentsCount === 0) return;
    const needsReport = !report || report.status === "processing" || isStale;
    if (!needsReport) return;
    attempted.current = true;
    void generate(false);
  }, [aiConsent, canGenerate, documentsCount, generate, isStale, report, working]);

  const result = report?.status === "ready" ? report.result : null;
  const documents = result ? sortReportDocuments(result.documents) : [];
  const coverage = result?.requirements ?? [];
  const totalCount = coverage.filter((item) => item.fit === "total").length;
  const partialCount = coverage.filter((item) => item.fit === "parcial").length;
  const missing = coverage.filter((item) => item.fit === "nenhum");
  const errorMessage =
    error ||
    (report?.status === "failed" && !isStale
      ? report.error ?? "O último relatório falhou."
      : "");
  const showStaleNotice = Boolean(result) && isStale && !refreshed && !working;

  return (
    <section className="section edital-panel document-report" aria-live="polite">
      <div className="edital-panel-head">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Documentos da empresa
          </span>
          <h2>O que você já tem para este edital</h2>
        </div>
        {result && (
          <span className="badge">Analisado por IA em {formatDate(result.generatedAt)}</span>
        )}
        {result && aiConsent && canGenerate && documentsCount > 0 && !working && (
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => void generate(true)}
          >
            Refazer análise
          </button>
        )}
      </div>

      {!canGenerate ? (
        <p className="notice">
          Quando o edital for lido e as exigências forem identificadas, a IA
          compara automaticamente os documentos do seu arquivo com cada uma
          delas.
        </p>
      ) : documentsCount === 0 ? (
        <p className="notice">
          Seu arquivo ainda não tem documentos. Envie os documentos da empresa
          (na página Minha empresa ou nos campos abaixo) para que a IA indique
          quais atendem a este edital.
        </p>
      ) : !aiConsent ? (
        <div className="edital-message">
          <p className="notice">
            A IA pode ler os documentos do seu arquivo, indicar quais atendem
            total ou parcialmente a cada exigência deste edital, explicar o
            motivo e já vinculá-los aos campos abaixo.
          </p>
          <label className="toggle-row consent-row">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            <span>
              Autorizo enviar o texto dos meus documentos ao provedor de
              inteligência artificial para analisá-los frente aos editais, conforme a{" "}
              <a href="/privacidade" target="_blank" rel="noreferrer">
                Política de Privacidade
              </a>
              . Posso revogar na página Conta.
            </span>
          </label>
          <button
            className="button button-small"
            type="button"
            disabled={!consentChecked || working}
            onClick={() => void grantConsentAndGenerate()}
          >
            Analisar meus documentos com IA
          </button>
        </div>
      ) : null}

      {working && (
        <div className="edital-progress">
          <span className="edital-spinner" aria-hidden="true" />
          <div>
            <strong>Comparando os documentos da empresa com as exigências do edital…</strong>
            <p>Isso pode levar até alguns minutos quando há muitos documentos.</p>
          </div>
        </div>
      )}

      {errorMessage && !working && (
        <div className="edital-message">
          <p className="notice notice-error">{errorMessage}</p>
          {aiConsent && canGenerate && documentsCount > 0 && (
            <button className="button button-small" type="button" onClick={() => void generate(true)}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {showStaleNotice && (
        <div className="edital-message">
          <p className="notice">
            Seus documentos ou o edital mudaram desde esta análise.
          </p>
          <button className="button button-small" type="button" onClick={() => void generate(false)}>
            Atualizar análise
          </button>
        </div>
      )}

      {result && !working && (
        <>
          <p className="edital-summary">
            {coverage.length > 0 ? (
              <>
                <strong>{totalCount}</strong> de {coverage.length} exigências com
                encaixe total e <strong>{partialCount}</strong> com encaixe
                parcial. Os documentos que se encaixam foram adicionados
                automaticamente aos campos abaixo; confira e desvincule se
                necessário.
              </>
            ) : (
              "Não há exigências para comparar."
            )}
          </p>
          {missing.length > 0 && (
            <div className="edital-alerts">
              <strong>Sem documento no seu arquivo</strong>
              <ul>
                {missing.map((item) => (
                  <li key={item.requirement}>{item.requirement}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="report-documents">
            {documents.map((document) => (
              <article className={`report-document fit-${document.fit}`} key={document.documentId}>
                <div className="report-document-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="document-name">{document.name}</div>
                    <div className="document-meta">{document.documentType}</div>
                  </div>
                  <span className={`fit-badge fit-badge-${document.fit}`}>
                    {documentFitLabels[document.fit]}
                  </span>
                </div>
                {document.summary && <p className="report-document-summary">{document.summary}</p>}
                <p className="report-document-explanation">{document.explanation}</p>
                {document.matches.length > 0 && (
                  <ul className="report-matches">
                    {document.matches.map((match) => (
                      <li key={match.requirement}>
                        <span className={`fit-badge fit-badge-${match.fit}`}>
                          {documentFitLabels[match.fit]}
                        </span>{" "}
                        <strong>{match.requirement}</strong>: {match.explanation}
                      </li>
                    ))}
                  </ul>
                )}
                {document.note && (
                  <p className="document-meta">{documentReportNoteLabels[document.note]}</p>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      <p className="fine-print">
        A IA pode errar. Confira cada documento e as exigências no edital
        oficial antes de enviar a proposta.
      </p>
    </section>
  );
}

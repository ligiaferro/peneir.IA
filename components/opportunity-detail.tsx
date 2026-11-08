"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { setAiConsentAction } from "@/app/actions";
import { DocumentReportPanel } from "@/components/document-report-panel";
import { DocumentUploader } from "@/components/document-uploader";
import { EditalPanel } from "@/components/edital-panel";
import { suggestDocumentsForRequirement } from "@/lib/document-matching";
import type { OpportunityDocumentReport } from "@/lib/document-report";
import {
  editalRequirementCategories,
  type OpportunityEdital,
} from "@/lib/edital-insights";
import { formatDate, formatDeadline } from "@/lib/format";
import { categoryLabels } from "@/lib/opportunities";
import {
  isGreatMatchScore,
  similarityToPercentage,
} from "@/lib/similarity";
import type {
  AnalysisResult,
  Opportunity,
  UserDocument,
  UserDocumentOpportunityLink,
} from "@/lib/types";

type AnalysisRecord = {
  document_id: string;
  result: AnalysisResult;
};

export function OpportunityDetail({
  opportunity,
  edital,
  initialDocuments,
  initialAnalyses,
  initialLinks,
  initialReport,
  reportIsStale,
  aiConsentGiven,
}: {
  opportunity: Opportunity;
  edital: OpportunityEdital | null;
  initialDocuments: UserDocument[];
  initialAnalyses: AnalysisRecord[];
  initialLinks: UserDocumentOpportunityLink[];
  initialReport: OpportunityDocumentReport | null;
  reportIsStale: boolean;
  aiConsentGiven: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [links, setLinks] = useState(initialLinks);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState(
    new Set<string>(),
  );
  const [documentId, setDocumentId] = useState(
    initialLinks[0]?.document_id ?? "",
  );
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [pending, setPending] = useState(false);
  const [aiConsent, setAiConsent] = useState(aiConsentGiven);
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const requirements = useMemo(() => {
    return [...new Set(opportunity.requirements.filter(Boolean))];
  }, [opportunity.requirements]);
  const opportunityDocuments = useMemo(
    () =>
      [
        ...new Set(
          links
            .filter((link) => link.opportunity_id === opportunity.id)
            .map((link) => link.document_id),
        ),
      ]
        .map((id) => documents.find((document) => document.id === id))
        .filter((document): document is UserDocument => document !== undefined),
    [documents, links, opportunity.id],
  );

  // Categoria e exigência específica de cada documento, quando vêm do edital.
  const requirementDetails = useMemo(
    () =>
      new Map(
        (!opportunity.requirementsAreGeneric ? edital?.insights?.requisitos ?? [] : []).map(
          (item) => [item.documento, item],
        ),
      ),
    [edital, opportunity.requirementsAreGeneric],
  );
  // Requisitos com documentos vinculados que não estão mais na lista após a
  // leitura do edital.
  const previousRequirements = useMemo(
    () => [
      ...new Set(
        links
          .filter(
            (link) =>
              link.opportunity_id === opportunity.id &&
              !requirements.includes(link.requirement),
          )
          .map((link) => link.requirement),
      ),
    ],
    [links, opportunity.id, requirements],
  );

  const currentAnalysis = useMemo(
    () => analyses.find((analysis) => analysis.document_id === documentId),
    [analyses, documentId],
  );
  const isGreatMatch =
    opportunity.matchScore !== undefined &&
    isGreatMatchScore(opportunity.matchScore);

  useEffect(() => {
    if (!opportunityDocuments.some((document) => document.id === documentId)) {
      setDocumentId(opportunityDocuments[0]?.id ?? "");
    }
  }, [opportunityDocuments, documentId]);

  function unlinkedDocuments(requirement: string) {
    return documents.filter(
      (document) =>
        !links.some(
          (link) =>
            link.opportunity_id === opportunity.id &&
            link.requirement === requirement &&
            link.document_id === document.id,
        ),
    );
  }

  function suggestionsFor(requirement: string) {
    return suggestDocumentsForRequirement(
      requirement,
      unlinkedDocuments(requirement).filter(
        (document) =>
          !dismissedSuggestionIds.has(`${requirement}\u0000${document.id}`),
      ),
    );
  }

  /** Documentos válidos que não aparecem como sugestão, para escolha manual. */
  function reusableDocumentsFor(requirement: string) {
    const today = new Date().toISOString().slice(0, 10);
    const suggested = new Set(
      suggestionsFor(requirement).map((suggestion) => suggestion.document.id),
    );
    return unlinkedDocuments(requirement).filter(
      (document) =>
        !suggested.has(document.id) &&
        (!document.expires_at || document.expires_at >= today),
    );
  }

  /** Vínculos de cada documento a este requisito (origem e encaixe da IA). */
  function linksFor(requirement: string) {
    return new Map(
      links
        .filter(
          (link) =>
            link.opportunity_id === opportunity.id &&
            link.requirement === requirement,
        )
        .map((link) => [link.document_id, link]),
    );
  }

  function linkedDocuments(requirement: string) {
    return links
      .filter(
        (link) =>
          link.opportunity_id === opportunity.id &&
          link.requirement === requirement,
      )
      .map((link) => documents.find((document) => document.id === link.document_id))
      .filter((document): document is UserDocument => document !== undefined);
  }

  function addDocumentAssociation(
    document: UserDocument,
    association: UserDocumentOpportunityLink,
  ) {
    setDocuments((currentDocuments) =>
      currentDocuments.some((item) => item.id === document.id)
        ? currentDocuments
        : [document, ...currentDocuments],
    );
    setLinks((currentLinks) => [
      ...currentLinks.filter(
        (link) =>
          !(
            link.document_id === association.document_id &&
            link.opportunity_id === association.opportunity_id &&
            link.requirement === association.requirement
          ),
      ),
      association,
    ]);
  }

  /** Vínculos desta oportunidade depois do relatório da IA. */
  const replaceOpportunityLinks = useCallback(
    (opportunityLinks: UserDocumentOpportunityLink[]) => {
      setLinks((currentLinks) => [
        ...currentLinks.filter((link) => link.opportunity_id !== opportunity.id),
        ...opportunityLinks,
      ]);
    },
    [opportunity.id],
  );
  const grantAiConsent = useCallback(() => setAiConsent(true), []);
  const canGenerateReport =
    edital?.status === "ready" &&
    !opportunity.requirementsAreGeneric &&
    requirements.length > 0;

  function removeDocumentAssociation(requirement: string, documentId: string) {
    setDismissedSuggestionIds((currentIds) =>
      new Set([...currentIds, `${requirement}\u0000${documentId}`]),
    );
    setLinks((currentLinks) =>
      currentLinks.filter(
        (link) =>
          !(
            link.opportunity_id === opportunity.id &&
            link.requirement === requirement &&
            link.document_id === documentId
          ),
      ),
    );
  }

  async function analyze() {
    if (!documentId) return;
    setPending(true);
    setError("");
    try {
      if (!aiConsent) {
        const consentResult = await setAiConsentAction(true);
        if (consentResult.error) {
          setError(consentResult.error);
          return;
        }
        setAiConsent(true);
      }
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
    <article
      className={`opportunity-detail${isGreatMatch ? " opportunity-card-great-match" : ""}`}
    >
      <div className="card-topline">
        <div className="card-badges">
          <span className="badge">{categoryLabels[opportunity.category]} · PNCP</span>
          {opportunity.matchScore !== undefined && (
            <span className="badge badge-similarity">
              Similaridade {similarityToPercentage(opportunity.matchScore)}%
            </span>
          )}
          {isGreatMatch && (
            <span className="badge badge-great-match">Ótima match</span>
          )}
        </div>
        <span className="card-date">
          Publicado {formatDate(opportunity.publishedAt)}
        </span>
      </div>
      <h1>{opportunity.title}</h1>
      <p className="organization">
        {opportunity.organization} · {opportunity.location}
      </p>
      <p className="opportunity-summary">{opportunity.summary}</p>
      <div className="card-footer opportunity-detail-deadline">
        <span>
          {opportunity.category === "licitacoes" ? "Propostas" : "Inscrições"}{" "}
          até {formatDeadline(opportunity.deadline)}
        </span>
        <a
          className="button button-secondary button-small"
          href={opportunity.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ver edital/fonte ↗
        </a>
      </div>

      {opportunity.source === "pncp" && (
        <EditalPanel opportunityId={opportunity.id} initialEdital={edital} />
      )}

      <DocumentReportPanel
        opportunityId={opportunity.id}
        canGenerate={canGenerateReport}
        documentsCount={documents.length}
        initialReport={initialReport}
        isStale={reportIsStale}
        aiConsent={aiConsent}
        onConsentGranted={grantAiConsent}
        onLinksChanged={replaceOpportunityLinks}
      />

      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Documentos solicitados</h2>
            <p>
              Envie um PDF no campo correspondente a cada documento. Todo
              arquivo enviado fica no arquivo da empresa e pode ser reutilizado
              (por você ou pela IA) em outras oportunidades, sem criar cópias.
            </p>
          </div>
        </div>
        {opportunity.requirementsAreGeneric ? (
          <p className="notice">
            Os requisitos ainda não foram extraídos do edital. Confira a fonte
            oficial e tente ler o edital novamente.
          </p>
        ) : requirements.length > 0 ? (
          <p className="notice">
            Documentos extraídos do edital pela IA. Confira sempre o edital
            oficial e seus anexos antes de enviar a proposta.
          </p>
        ) : (
          <p className="notice">
            A leitura não identificou documentos expressamente exigidos. Confira
            o edital oficial e seus anexos antes de enviar a proposta.
          </p>
        )}
        <div className="requirement-list">
          {requirements.length === 0 ? (
            <p>
              {opportunity.requirementsAreGeneric
                ? "Nenhum documento será sugerido até que o edital seja lido."
                : "Não há documentos extraídos para enviar nesta oportunidade."}
            </p>
          ) : requirements.map((requirement, index) => (
            <section
              className="panel requirement-panel"
              key={`${index}-${requirement}`}
            >
              <span className="eyebrow">
                Documento {index + 1}
                {requirementDetails.get(requirement) &&
                  ` · ${editalRequirementCategories[requirementDetails.get(requirement)!.categoria]}`}
              </span>
              <h3>{requirement}</h3>
              {requirementDetails.get(requirement)?.detalhe && (
                <p className="requirement-detail">
                  {requirementDetails.get(requirement)!.detalhe}
                </p>
              )}
              <DocumentUploader
                opportunityId={opportunity.id}
                fieldId={`requirement-${index}`}
                requirement={requirement}
                documents={linkedDocuments(requirement)}
                links={linksFor(requirement)}
                suggestions={suggestionsFor(requirement)}
                reusableDocuments={reusableDocumentsFor(requirement)}
                onUploaded={addDocumentAssociation}
                onLinked={addDocumentAssociation}
                onUnlinked={(documentId) =>
                  removeDocumentAssociation(requirement, documentId)
                }
              />
            </section>
          ))}
          {previousRequirements.map((requirement, index) => (
            <section
              className="panel requirement-panel"
              key={`previous-${index}-${requirement}`}
            >
              <span className="eyebrow">Vinculado anteriormente</span>
              <h3>{requirement}</h3>
              <DocumentUploader
                opportunityId={opportunity.id}
                fieldId={`previous-${index}`}
                requirement={requirement}
                documents={linkedDocuments(requirement)}
                links={linksFor(requirement)}
                suggestions={[]}
                onUploaded={addDocumentAssociation}
                onLinked={addDocumentAssociation}
                onUnlinked={(documentId) =>
                  removeDocumentAssociation(requirement, documentId)
                }
              />
            </section>
          ))}
        </div>
      </section>

      <section className="section analysis-box">
        <h2>Comparar documento com esta oportunidade</h2>
        {opportunityDocuments.length === 0 ? (
          <p>Envie um documento solicitado acima para iniciar a análise.</p>
        ) : (
          <div className="form-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="analysis-document">Documento</label>
              <select
                id="analysis-document"
                className="input"
                value={documentId}
                onChange={(event) => setDocumentId(event.target.value)}
              >
                {opportunityDocuments.map((document) => (
                  <option value={document.id} key={document.id}>
                    {document.document_type} — {document.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="requirement-upload-action">
              <button
                className="button button-small"
                type="button"
                disabled={pending || !documentId || (!aiConsent && !consentChecked)}
                onClick={analyze}
              >
                {pending ? "Analisando..." : "Analisar com IA"}
              </button>
            </div>
          </div>
        )}
        {!aiConsent && opportunityDocuments.length > 0 && (
          <label className="toggle-row consent-row">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            <span>
              Autorizo enviar o texto dos meus documentos ao provedor de
              inteligência artificial para esta análise, conforme a{" "}
              <a href="/privacidade" target="_blank" rel="noreferrer">
                Política de Privacidade
              </a>
              . Posso revogar na página Conta.
            </span>
          </label>
        )}
        {error && <p className="notice notice-error">{error}</p>}
        {currentAnalysis && <AnalysisDetails result={currentAnalysis.result} />}
        <p className="fine-print">
          A IA pode errar. Confira os requisitos no edital original antes de
          tomar qualquer decisão.
        </p>
      </section>
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

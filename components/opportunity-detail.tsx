"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentUploader } from "@/components/document-uploader";
import { EditalPanel } from "@/components/edital-panel";
import { suggestDocumentsForRequirement } from "@/lib/document-matching";
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
}: {
  opportunity: Opportunity;
  edital: OpportunityEdital | null;
  initialDocuments: UserDocument[];
  initialAnalyses: AnalysisRecord[];
  initialLinks: UserDocumentOpportunityLink[];
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
  const [error, setError] = useState("");
  const router = useRouter();
  const requirements = useMemo(() => {
    const unique = [...new Set(opportunity.requirements.filter(Boolean))];
    return unique.length > 0 ? unique : ["Documento complementar"];
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
  // Requisitos com documentos vinculados que não estão mais na lista (por
  // exemplo, da lista genérica, antes de ela ser trocada pela do edital).
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
    setLinks((currentLinks) =>
      currentLinks.some(
        (link) =>
          link.document_id === association.document_id &&
          link.opportunity_id === association.opportunity_id &&
          link.requirement === association.requirement,
      )
        ? currentLinks
        : [...currentLinks, association],
    );
  }

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

      <section className="section">
        <div className="section-heading">
          <div>
            <h2>Documentos solicitados</h2>
            <p>
              Envie um PDF no campo correspondente a cada documento. Os arquivos
              ficam associados ao requisito e à oportunidade; a reutilização
              mantém o arquivo privado original, sem criar cópias.
            </p>
          </div>
        </div>
        {opportunity.requirementsAreGeneric ? (
          <p className="notice">
            Esta lista é uma orientação geral e pode não corresponder aos
            documentos exigidos no edital. Confira a fonte oficial.
          </p>
        ) : (
          <p className="notice">
            Documentos extraídos do edital pela IA. Confira sempre o edital
            oficial e seus anexos antes de enviar a proposta.
          </p>
        )}
        <div className="requirement-list">
          {requirements.map((requirement, index) => (
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
                suggestions={suggestDocumentsForRequirement(
                  requirement,
                  documents.filter(
                    (document) =>
                      !links.some(
                        (link) =>
                          link.opportunity_id === opportunity.id &&
                          link.requirement === requirement &&
                          link.document_id === document.id,
                      ) &&
                      !dismissedSuggestionIds.has(
                        `${requirement}\u0000${document.id}`,
                      ),
                  ),
                )}
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, formatDeadline } from "@/lib/format";
import { categoryLabels } from "@/lib/opportunities";
import {
  isGreatMatchScore,
  similarityToPercentage,
} from "@/lib/similarity";
import { watchEdital, type EditalSnapshot } from "@/lib/edital-client";
import type { EditalStatus } from "@/lib/edital-insights";
import type { Opportunity } from "@/lib/types";

export function OpportunityCard({
  opportunity,
  linkedRequirements,
  suggestedRequirements,
  initialEditalStatus,
  autoReadEligible,
}: {
  opportunity: Opportunity;
  linkedRequirements: string[];
  suggestedRequirements: string[];
  initialEditalStatus: EditalStatus | null;
  autoReadEligible: boolean;
}) {
  const similarity = opportunity.matchScore ?? 0;
  const similarityPercentage = similarityToPercentage(similarity);
  const isGreatMatch = isGreatMatchScore(similarity);
  const [editalStatus, setEditalStatus] = useState(initialEditalStatus);
  const [requirements, setRequirements] = useState(opportunity.requirements);
  const [readError, setReadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const apply = (edital: EditalSnapshot | null) => {
      if (cancelled) return;
      // null: o acompanhamento desistiu; o botão de leitura manual volta a valer.
      setEditalStatus(edital ? edital.status : null);
      if (edital?.status === "ready") setRequirements(edital.requirements);
    };

    // A leitura corre no servidor, em segundo plano; o card só acompanha.
    if (initialEditalStatus === "processing" || (initialEditalStatus === null && autoReadEligible)) {
      setEditalStatus("processing");
      setReadError("");
      const stopWatching = watchEdital(opportunity.id, apply);
      return () => {
        cancelled = true;
        stopWatching();
      };
    }
  }, [autoReadEligible, initialEditalStatus, opportunity.id]);

  const requirementsLabel =
    editalStatus === "processing"
      ? "Leitura do edital em andamento"
      : editalStatus === "ready"
        ? "Requisitos informados no edital"
        : "Requisitos do edital";

  return (
    <Link
      className={`opportunity-card${isGreatMatch ? " opportunity-card-great-match" : ""}`}
      href={`/oportunidade?id=${encodeURIComponent(opportunity.id)}`}
    >
      <div className="card-topline">
        <div className="card-badges">
          <span className="badge">
            {categoryLabels[opportunity.category]} · PNCP
          </span>
          <span className="badge badge-similarity">
            Similaridade {similarityPercentage}%
          </span>
          {isGreatMatch && (
            <span className="badge badge-great-match">Ótima match</span>
          )}
        </div>
        <span className="card-date">
          Publicado {formatDate(opportunity.publishedAt)}
        </span>
      </div>
      <h3>{opportunity.title}</h3>
      <p className="organization">
        {opportunity.organization} · {opportunity.location}
      </p>
      <p className="opportunity-summary">{opportunity.summary}</p>
      {editalStatus === "processing" && (
        <div className="card-edital-progress" role="status" aria-live="polite">
          <span className="edital-spinner edital-card-spinner" aria-hidden="true" />
          <span>
            <strong>A IA está lendo este edital</strong>
            <small>Extraindo requisitos e condições da oportunidade.</small>
          </span>
        </div>
      )}
      <span className="field-label">{requirementsLabel}</span>
      {readError && <p className="notice notice-error">{readError}</p>}
      <ul className="requirements">
        {requirements.length === 0 ? (
          <li>
            {editalStatus === "processing"
              ? "Os requisitos aparecerão aqui quando a leitura terminar."
              : editalStatus === "ready"
                ? "A leitura não identificou documentos exigidos."
                : readError
                  ? "Abra a oportunidade para conferir o edital."
                  : "Abra a oportunidade para ler o edital."}
          </li>
        ) : requirements.map((requirement, index) => (
          <li key={`${index}-${requirement}`}>
            {requirement}
            {linkedRequirements.includes(requirement) ? (
              <span
                className="requirement-linked-check"
                role="img"
                aria-label="Documento vinculado"
                title="Documento vinculado a esta oportunidade"
              >
                ✓
              </span>
            ) : suggestedRequirements.includes(requirement) ? (
              <span
                className="requirement-linked-check requirement-suggested-check"
                role="img"
                aria-label="Documento compatível disponível, ainda não adicionado"
                title="Há um documento compatível disponível, mas ainda não foi adicionado"
              >
                ✓
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="card-footer">
        <span>
          {opportunity.category === "licitacoes" ? "Propostas" : "Inscrições"}{" "}
          até {formatDeadline(opportunity.deadline)}
        </span>
        <span className="opportunity-card-link">Ver oportunidade e enviar documentos →</span>
      </div>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, formatDeadline } from "@/lib/format";
import { categoryLabels } from "@/lib/opportunities";
import {
  isGreatMatchScore,
  similarityToPercentage,
} from "@/lib/similarity";
import type { EditalStatus } from "@/lib/edital-insights";
import type { Opportunity } from "@/lib/types";

type EditalStatusResponse = {
  edital?: { status: EditalStatus; requirements: string[] } | null;
  error?: string;
};

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

    const updateStatus = (edital: EditalStatusResponse["edital"]) => {
      if (cancelled || !edital) return;
      setEditalStatus(edital.status);
      if (edital.status === "ready") setRequirements(edital.requirements);
    };

    const poll = async () => {
      const deadline = Date.now() + 6 * 60_000;
      while (!cancelled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        if (cancelled) return;
        try {
          const response = await fetch(`/api/edital?id=${encodeURIComponent(opportunity.id)}`, {
            cache: "no-store",
          });
          const body = (await response.json()) as EditalStatusResponse;
          if (!response.ok) throw new Error(body.error ?? "Não foi possível consultar a leitura.");
          if (body.edital && body.edital.status !== "processing") {
            updateStatus(body.edital);
            return;
          }
        } catch (error) {
          if (!cancelled) {
            setReadError(error instanceof Error ? error.message : "Falha ao consultar a leitura.");
            return;
          }
        }
      }
    };

    const startAutomaticRead = async () => {
      setEditalStatus("processing");
      setReadError("");
      try {
        const response = await fetch("/api/edital", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId: opportunity.id }),
        });
        const body = (await response.json()) as EditalStatusResponse;
        if (!response.ok) throw new Error(body.error ?? "Não foi possível iniciar a leitura.");
        if (body.edital && body.edital.status !== "processing") {
          updateStatus(body.edital);
          return;
        }
        await poll();
      } catch (error) {
        if (!cancelled) {
          setEditalStatus(null);
          setReadError(error instanceof Error ? error.message : "Falha ao iniciar a leitura.");
        }
      }
    };

    if (initialEditalStatus === "processing") {
      void poll();
    } else if (initialEditalStatus === null && autoReadEligible) {
      void startAutomaticRead();
    }

    return () => {
      cancelled = true;
    };
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

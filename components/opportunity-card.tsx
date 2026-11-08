import Link from "next/link";
import { formatDate, formatDeadline } from "@/lib/format";
import { categoryLabels } from "@/lib/opportunities";
import {
  isGreatMatchScore,
  similarityToPercentage,
} from "@/lib/similarity";
import type { Opportunity } from "@/lib/types";

export function OpportunityCard({
  opportunity,
}: {
  opportunity: Opportunity;
}) {
  const similarity = opportunity.matchScore ?? 0;
  const similarityPercentage = similarityToPercentage(similarity);
  const isGreatMatch = isGreatMatchScore(similarity);

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
      <span className="field-label">
        {opportunity.requirementsAreGeneric
          ? "Requisitos usuais de habilitação (confira o edital)"
          : "Requisitos informados no edital"}
      </span>
      <ul className="requirements">
        {opportunity.requirements.map((requirement) => (
          <li key={requirement}>{requirement}</li>
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

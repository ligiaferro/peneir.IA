export const opportunityCategories = [
  "licitacoes",
  "concursos",
  "doutorado",
  "bolsas",
] as const;

export type OpportunityCategory = (typeof opportunityCategories)[number];
export type UserKind = "empresa" | "pessoa";
export type OpportunitySource = "pncp" | "demo";

export type Opportunity = {
  id: string;
  source: OpportunitySource;
  title: string;
  organization: string;
  category: OpportunityCategory;
  location: string;
  summary: string;
  tags: string[];
  requirements: string[];
  /** true quando os requisitos são uma lista genérica e não foram lidos do edital. */
  requirementsAreGeneric: boolean;
  /** Data e hora de encerramento (ISO 8601). */
  deadline: string;
  publishedAt: string;
  /** Quando a peneir.IA viu a oportunidade pela primeira vez (ISO 8601). */
  firstSeenAt: string;
  sourceUrl: string;
};

export type UserProfile = {
  id: string;
  full_name: string;
  user_kind: UserKind;
  categories: OpportunityCategory[];
  keywords: string[];
  email_alerts: boolean;
};

export type UserDocument = {
  id: string;
  user_id: string;
  name: string;
  document_type: string;
  expires_at: string | null;
  storage_path: string;
  created_at: string;
};

export type AnalysisResult = {
  documentSummary: string;
  extractedExpiryDate: string | null;
  requirements: Array<{
    requirement: string;
    status: "atende" | "parcial" | "nao_atende" | "inconclusivo";
    evidence: string;
  }>;
  issues: string[];
  reviewNotes: string[];
};

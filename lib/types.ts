export const opportunityCategories = ["licitacoes"] as const;

export type OpportunityCategory = (typeof opportunityCategories)[number];
export type UserKind = "empresa" | "pessoa";
export type OpportunitySource = "pncp";

export type Opportunity = {
  id: string;
  source: OpportunitySource;
  title: string;
  organization: string;
  category: OpportunityCategory;
  location: string;
  /** UF da oportunidade; null quando não há UF (abrangência nacional). */
  uf: string | null;
  summary: string;
  tags: string[];
  matchScore?: number;
  requirements: string[];
  /** true enquanto os requisitos do edital ainda não foram extraídos. */
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
  products_services: string;
  embedding_model: string | null;
  /** UFs de atuação. Vazio = todos os estados. */
  states: string[];
  email_alerts: boolean;
};

export type UserDocument = {
  id: string;
  user_id: string;
  opportunity_id: string | null;
  name: string;
  document_type: string;
  expires_at: string | null;
  storage_path: string;
  created_at: string;
};

export type UserDocumentOpportunityLink = {
  user_id: string;
  document_id: string;
  opportunity_id: string;
  requirement: string;
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

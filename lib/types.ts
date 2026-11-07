export const opportunityCategories = [
  "licitacoes",
  "concursos",
  "doutorado",
  "bolsas",
] as const;

export type OpportunityCategory = (typeof opportunityCategories)[number];
export type UserKind = "empresa" | "pessoa";

export type Opportunity = {
  id: string;
  title: string;
  organization: string;
  category: OpportunityCategory;
  location: string;
  summary: string;
  tags: string[];
  requirements: string[];
  deadline: string;
  publishedAt: string;
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

import type {
  AnalysisResult,
  DocumentLinkFit,
  DocumentLinkSource,
  OpportunityCategory,
  UserKind,
} from "@/lib/types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Fonte real das oportunidades gravadas em `public.opportunities`. */
type OpportunitySourceTable = "pncp";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          user_kind: UserKind;
          categories: OpportunityCategory[];
          keywords: string[];
          products_services: string;
          embedding: string | null;
          embedding_model: string | null;
          embedding_updated_at: string | null;
          states: string[];
          terms_accepted_at: string | null;
          ai_consent_at: string | null;
          report_emails: boolean;
          email_alerts: boolean;
          last_immediate_alert_at: string | null;
          cnpj: string | null;
          last_cnpj_lookup_at: string | null;
          company_size: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          user_kind?: UserKind;
          categories?: OpportunityCategory[];
          keywords?: string[];
          products_services?: string;
          embedding?: string | null;
          embedding_model?: string | null;
          embedding_updated_at?: string | null;
          states?: string[];
          terms_accepted_at?: string | null;
          ai_consent_at?: string | null;
          report_emails?: boolean;
          email_alerts?: boolean;
          last_immediate_alert_at?: string | null;
          cnpj?: string | null;
          last_cnpj_lookup_at?: string | null;
          company_size?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          user_kind?: UserKind;
          categories?: OpportunityCategory[];
          keywords?: string[];
          products_services?: string;
          embedding?: string | null;
          embedding_model?: string | null;
          embedding_updated_at?: string | null;
          states?: string[];
          terms_accepted_at?: string | null;
          ai_consent_at?: string | null;
          report_emails?: boolean;
          email_alerts?: boolean;
          last_immediate_alert_at?: string | null;
          cnpj?: string | null;
          last_cnpj_lookup_at?: string | null;
          company_size?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string | null;
          name: string;
          document_type: string;
          expires_at: string | null;
          storage_path: string;
          extracted_text: string | null;
          text_extracted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id?: string | null;
          name: string;
          document_type?: string;
          expires_at?: string | null;
          storage_path: string;
          extracted_text?: string | null;
          text_extracted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          opportunity_id?: string | null;
          name?: string;
          document_type?: string;
          expires_at?: string | null;
          storage_path?: string;
          extracted_text?: string | null;
          text_extracted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      document_opportunities: {
        Row: {
          user_id: string;
          document_id: string;
          opportunity_id: string;
          requirement: string;
          added_by: DocumentLinkSource;
          ai_fit: DocumentLinkFit | null;
          ai_explanation: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          document_id: string;
          opportunity_id: string;
          requirement: string;
          added_by?: DocumentLinkSource;
          ai_fit?: DocumentLinkFit | null;
          ai_explanation?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          document_id?: string;
          opportunity_id?: string;
          requirement?: string;
          added_by?: DocumentLinkSource;
          ai_fit?: DocumentLinkFit | null;
          ai_explanation?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_opportunities_document_id_user_id_fkey";
            columns: ["document_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "document_opportunities_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      document_link_dismissals: {
        Row: {
          user_id: string;
          document_id: string;
          opportunity_id: string;
          requirement: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          document_id: string;
          opportunity_id: string;
          requirement: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          document_id?: string;
          opportunity_id?: string;
          requirement?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_link_dismissals_document_id_user_id_fkey";
            columns: ["document_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "document_link_dismissals_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      document_analyses: {
        Row: {
          id: string;
          user_id: string;
          document_id: string;
          opportunity_id: string;
          result: AnalysisResult;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          document_id: string;
          opportunity_id: string;
          result: AnalysisResult;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          document_id?: string;
          opportunity_id?: string;
          result?: AnalysisResult;
          created_at?: string;
        };
        Relationships: [];
      };
      opportunity_document_reports: {
        Row: {
          user_id: string;
          opportunity_id: string;
          status: "processing" | "ready" | "failed";
          result: Json | null;
          signature: string | null;
          model: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          opportunity_id: string;
          status?: "processing" | "ready" | "failed";
          result?: Json | null;
          signature?: string | null;
          model?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          opportunity_id?: string;
          status?: "processing" | "ready" | "failed";
          result?: Json | null;
          signature?: string | null;
          model?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_document_reports_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_editais: {
        Row: {
          opportunity_id: string;
          status: "processing" | "ready" | "no_files" | "no_text" | "failed";
          files: Json;
          insights: Json | null;
          requirements: string[];
          text_length: number | null;
          model: string | null;
          error: string | null;
          processed_at: string | null;
          checked_at: string | null;
          updated_at: string;
        };
        Insert: {
          opportunity_id: string;
          status?: "processing" | "ready" | "no_files" | "no_text" | "failed";
          files?: Json;
          insights?: Json | null;
          requirements?: string[];
          text_length?: number | null;
          model?: string | null;
          error?: string | null;
          processed_at?: string | null;
          checked_at?: string | null;
          updated_at?: string;
        };
        Update: {
          opportunity_id?: string;
          status?: "processing" | "ready" | "no_files" | "no_text" | "failed";
          files?: Json;
          insights?: Json | null;
          requirements?: string[];
          text_length?: number | null;
          model?: string | null;
          error?: string | null;
          processed_at?: string | null;
          checked_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_deliveries: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string;
          status: "pending" | "sending" | "sent";
          updated_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id: string;
          status?: "pending" | "sending" | "sent";
          updated_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          opportunity_id?: string;
          status?: "pending" | "sending" | "sent";
          updated_at?: string;
          sent_at?: string | null;
        };
        Relationships: [];
      };
      opportunities: {
        Row: {
          id: string;
          source: OpportunitySourceTable;
          external_id: string;
          region: string;
          category: OpportunityCategory;
          title: string;
          organization: string;
          location: string;
          summary: string;
          tags: string[];
          requirements: string[];
          requirements_are_generic: boolean;
          deadline: string;
          published_at: string;
          source_url: string;
          raw: Json | null;
          commercial_concepts: string[];
          embedding: string | null;
          embedding_model: string | null;
          embedding_input_version: number;
          index_status: "pending" | "indexed" | "irrelevant" | "failed";
          index_error: string | null;
          indexed_at: string | null;
          first_seen_at: string;
          last_seen_at: string;
          closed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          source: OpportunitySourceTable;
          external_id: string;
          region?: string;
          category: OpportunityCategory;
          title: string;
          organization: string;
          location?: string;
          summary?: string;
          tags?: string[];
          requirements?: string[];
          requirements_are_generic?: boolean;
          deadline: string;
          published_at: string;
          source_url: string;
          raw?: Json | null;
          commercial_concepts?: string[];
          embedding?: string | null;
          embedding_model?: string | null;
          embedding_input_version?: number;
          index_status?: "pending" | "indexed" | "irrelevant" | "failed";
          index_error?: string | null;
          indexed_at?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
          closed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source?: OpportunitySourceTable;
          external_id?: string;
          region?: string;
          category?: OpportunityCategory;
          title?: string;
          organization?: string;
          location?: string;
          summary?: string;
          tags?: string[];
          requirements?: string[];
          requirements_are_generic?: boolean;
          deadline?: string;
          published_at?: string;
          source_url?: string;
          raw?: Json | null;
          commercial_concepts?: string[];
          embedding?: string | null;
          embedding_model?: string | null;
          embedding_input_version?: number;
          index_status?: "pending" | "indexed" | "irrelevant" | "failed";
          index_error?: string | null;
          indexed_at?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
          closed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_cnpj_lookup: {
        Args: { p_cooldown_seconds?: number };
        Returns: number;
      };
      claim_immediate_alert: {
        Args: { p_cooldown_seconds?: number };
        Returns: number;
      };
      release_immediate_alert: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      claim_edital_processing: {
        Args: { p_opportunity_id: string; p_force?: boolean };
        Returns: boolean;
      };
      search_user_opportunities: {
        Args: {
          p_user_id: string;
          p_categories: string[];
          p_regions: string[];
          p_query?: string | null;
          p_deadline_before?: string | null;
          p_order?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Array<{ opportunity_id: string; similarity: number; total_count: number }>;
      };
      prune_old_opportunities: {
        Args: { p_cutoff: string };
        Returns: number;
      };
      claim_edital_reread: {
        Args: { p_opportunity_id: string };
        Returns: boolean;
      };
      claim_document_report: {
        Args: { p_opportunity_id: string; p_signature: string; p_force?: boolean };
        Returns: boolean;
      };
      claim_opportunity_notification: {
        Args: {
          p_user_id: string;
          p_opportunity_id: string;
        };
        Returns: boolean;
      };
      match_user_opportunities: {
        Args: {
          p_user_id: string;
          p_categories: string[];
          p_regions: string[];
          p_min_similarity?: number;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Array<{ opportunity_id: string; similarity: number }>;
      };
      match_opportunities_for_users: {
        Args: {
          p_user_ids: string[];
          p_regions: string[];
          p_min_similarity?: number;
          p_limit_per_user?: number;
          p_created_since?: string | null;
        };
        Returns: Array<{
          user_id: string;
          opportunity_id: string;
          similarity: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

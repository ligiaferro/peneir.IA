import type { AnalysisResult, OpportunityCategory, UserKind } from "@/lib/types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Fontes reais gravadas em `public.opportunities` (as de demonstração ficam no código). */
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
          email_alerts: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          user_kind?: UserKind;
          categories?: OpportunityCategory[];
          keywords?: string[];
          email_alerts?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          user_kind?: UserKind;
          categories?: OpportunityCategory[];
          keywords?: string[];
          email_alerts?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          document_type: string;
          expires_at: string | null;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          document_type?: string;
          expires_at?: string | null;
          storage_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          document_type?: string;
          expires_at?: string | null;
          storage_path?: string;
          created_at?: string;
        };
        Relationships: [];
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
      claim_opportunity_notification: {
        Args: {
          p_user_id: string;
          p_opportunity_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

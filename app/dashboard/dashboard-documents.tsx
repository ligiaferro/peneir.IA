"use client";

import { useState } from "react";
import { DocumentUploader } from "@/components/document-uploader";
import { getDocumentSuggestions } from "@/lib/document-suggestions";
import type { OpportunityCategory, UserDocument } from "@/lib/types";

export function DashboardDocuments({
  initialDocuments,
  categories,
  keywords,
}: {
  initialDocuments: UserDocument[];
  categories: OpportunityCategory[];
  keywords: string[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  return (
    <DocumentUploader
      documents={documents}
      suggestedDocumentTypes={getDocumentSuggestions(categories, keywords)}
      onChange={setDocuments}
    />
  );
}

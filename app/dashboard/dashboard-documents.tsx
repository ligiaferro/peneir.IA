"use client";

import { useState } from "react";
import { DocumentUploader } from "@/components/document-uploader";
import type { UserDocument } from "@/lib/types";

export function DashboardDocuments({
  initialDocuments,
}: {
  initialDocuments: UserDocument[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  return <DocumentUploader documents={documents} onChange={setDocuments} />;
}

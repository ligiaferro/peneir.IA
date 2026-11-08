import type { Metadata } from "next";
import { PasswordResetRequestForm } from "./request-form";

export const metadata: Metadata = { title: "Recuperar senha | peneir.IA" };

export default function PasswordRecoveryPage() {
  return <PasswordResetRequestForm />;
}

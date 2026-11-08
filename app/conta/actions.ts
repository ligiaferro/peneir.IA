"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, user: data.user };
}

async function updateOwnProfile(values: {
  email_alerts?: boolean;
  report_emails?: boolean;
  ai_consent_at?: string | null;
  terms_accepted_at?: string;
}) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw new Error("Não foi possível salvar sua escolha.");
  revalidatePath("/conta");
}

export async function setEmailAlertsFormAction(formData: FormData) {
  await updateOwnProfile({ email_alerts: formData.get("enabled") === "true" });
}

export async function setReportEmailsFormAction(formData: FormData) {
  await updateOwnProfile({ report_emails: formData.get("enabled") === "true" });
}

export async function setAiConsentFormAction(formData: FormData) {
  await updateOwnProfile({
    ai_consent_at: formData.get("granted") === "true" ? new Date().toISOString() : null,
  });
}

export async function acceptTermsFormAction() {
  await updateOwnProfile({ terms_accepted_at: new Date().toISOString() });
}

export type DeleteAccountState = { error?: string };

/**
 * Exclui a conta: remove os arquivos do armazenamento e apaga o usuário. As
 * demais tabelas (perfil, documentos, vínculos, análises) são apagadas em
 * cascata pelo banco.
 */
export async function deleteAccountAction(
  _previousState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  if (String(formData.get("confirmation") ?? "").trim().toUpperCase() !== "EXCLUIR") {
    return { error: "Digite EXCLUIR para confirmar." };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "A exclusão de contas não está configurada no servidor." };
  }
  const { supabase, user } = await requireUser();

  // Arquivos privados ficam em documents/<id do usuário>/.
  for (;;) {
    const { data: files, error } = await supabase.storage
      .from("documents")
      .list(user.id, { limit: 100 });
    if (error) {
      console.error("Could not list documents for account deletion.", { userId: user.id });
      return { error: "Não foi possível apagar seus documentos. Tente novamente." };
    }
    if (files.length === 0) break;
    const { data: removed, error: removeError } = await supabase.storage
      .from("documents")
      .remove(files.map((file) => `${user.id}/${file.name}`));
    // Sem nada removido, a listagem voltaria igual e o laço não terminaria.
    if (removeError || removed.length === 0) {
      console.error("Could not remove documents for account deletion.", { userId: user.id });
      return { error: "Não foi possível apagar seus documentos. Tente novamente." };
    }
  }

  const { error: deleteError } = await createServiceClient().auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Could not delete auth user.", { userId: user.id, error: deleteError.message });
    return { error: "Seus documentos foram apagados, mas não foi possível excluir a conta. Tente novamente." };
  }
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/?conta=excluida");
}

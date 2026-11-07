"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOpportunityCategory } from "@/lib/opportunities";

export type ProfileState = { error?: string; notice?: string };

export async function updateProfileAction(
  _previousState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const userKind = String(formData.get("user_kind") ?? "");
  const categories = formData
    .getAll("categories")
    .map(String)
    .filter(isOpportunityCategory);
  const keywords = String(formData.get("keywords") ?? "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 20);
  const emailAlerts = formData.get("email_alerts") === "on";

  if (!fullName || !["empresa", "pessoa"].includes(userKind)) {
    return { error: "Informe um nome e selecione o tipo de perfil." };
  }
  if (categories.length === 0 && keywords.length === 0) {
    return {
      error: "Selecione ao menos uma categoria ou informe uma palavra-chave do que está buscando.",
    };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: "Sua sessão expirou. Entre novamente." };

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      user_kind: userKind as "empresa" | "pessoa",
      categories,
      keywords,
      email_alerts: emailAlerts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", authData.user.id)
    .select("id")
    .maybeSingle();
  if (updateError) {
    console.error("Could not update user profile.", {
      userId: authData.user.id,
      error: updateError.message,
    });
    return { error: "Não foi possível salvar seu perfil. Tente novamente." };
  }
  if (!updatedProfile) {
    return { error: "Não foi possível salvar seu perfil. Tente novamente." };
  }

  revalidatePath("/dashboard");
  return { notice: "Perfil atualizado." };
}

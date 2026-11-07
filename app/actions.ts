"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/lib/db";
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

  let updatedRows;
  try {
    updatedRows = await withUserDb(authData.user.id, (database) =>
      database.query(
        `UPDATE public.profiles
         SET full_name = $2,
             user_kind = $3,
             categories = $4::text[],
             keywords = $5::text[],
             email_alerts = $6,
             updated_at = now()
         WHERE id = $1`,
        [
          authData.user.id,
          fullName,
          userKind,
          categories,
          keywords,
          emailAlerts,
        ],
      ),
    );
  } catch {
    return { error: "Não foi possível acessar o banco de dados. Tente novamente." };
  }
  if (updatedRows.rowCount !== 1) {
    return { error: "Não foi possível salvar seu perfil. Tente novamente." };
  }

  revalidatePath("/dashboard");
  return { notice: "Perfil atualizado." };
}

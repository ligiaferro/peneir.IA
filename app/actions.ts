"use server";

import { revalidatePath } from "next/cache";
import { createEmbeddings, getEmbeddingModel, vectorToPostgres } from "@/lib/ai";
import { buildProfileEmbeddingText } from "@/lib/opportunity-indexing";
import { createClient } from "@/lib/supabase/server";
import { isOpportunityCategory } from "@/lib/opportunities";

export type ProfileState = { error?: string; notice?: string };

export async function updateProfileAction(
  _previousState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const productsServices = String(formData.get("products_services") ?? "")
    .trim();
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

  if (!fullName) {
    return { error: "Informe um nome ou razão social." };
  }
  if (productsServices.length > 4000) {
    return { error: "A descrição pode ter no máximo 4.000 caracteres." };
  }
  if (keywords.some((keyword) => keyword.length > 200)) {
    return { error: "Cada palavra-chave pode ter no máximo 200 caracteres." };
  }
  if (categories.length === 0 && keywords.length === 0) {
    return {
      error: "Selecione ao menos uma categoria ou informe uma palavra-chave do que está buscando.",
    };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: "Sua sessão expirou. Entre novamente." };

  const { data: currentProfile, error: currentProfileError } = await supabase
    .from("profiles")
    .select("user_kind, products_services, keywords, embedding, embedding_model")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (currentProfileError || !currentProfile) {
    console.error("Could not load profile before updating its semantic vector.", {
      userId: authData.user.id,
      error: currentProfileError?.message ?? "Profile not found.",
    });
    return { error: "Não foi possível carregar seu perfil. Tente novamente." };
  }
  if (currentProfile.user_kind === "empresa" && !productsServices) {
    return {
      error: "Descreva os produtos ou serviços que sua empresa fornece para encontrar licitações compatíveis.",
    };
  }

  const embeddingText = buildProfileEmbeddingText(productsServices, keywords);
  const embeddingModel = embeddingText ? getEmbeddingModel() : null;
  const embeddingChanged =
    currentProfile.products_services !== productsServices ||
    JSON.stringify(currentProfile.keywords) !== JSON.stringify(keywords) ||
    currentProfile.embedding_model !== embeddingModel ||
    (embeddingText.length > 0 && currentProfile.embedding === null);
  let embeddingUpdate:
    | { embedding: string | null; embedding_model: string | null; embedding_updated_at: string | null }
    | undefined;
  if (embeddingChanged) {
    if (embeddingText) {
      try {
        const [embedding] = await createEmbeddings([embeddingText]);
        if (!embedding) throw new Error("The embeddings endpoint returned no profile vector.");
        embeddingUpdate = {
          embedding: vectorToPostgres(embedding),
          embedding_model: embeddingModel,
          embedding_updated_at: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Could not generate the profile semantic vector.", {
          userId: authData.user.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          error:
            "Não foi possível preparar sua busca semântica. Verifique OPENAI_API_KEY, OPENAI_BASE_URL e OPENAI_EMBEDDING_MODEL.",
        };
      }
    } else {
      embeddingUpdate = {
        embedding: null,
        embedding_model: null,
        embedding_updated_at: null,
      };
    }
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      user_kind: currentProfile.user_kind,
      categories,
      keywords,
      products_services: productsServices,
      ...embeddingUpdate,
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

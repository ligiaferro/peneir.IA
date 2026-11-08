"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import {
  createEmbeddings,
  getEmbeddingModel,
  isAboveSemanticMatchThreshold,
  minimumOpportunitySimilarity,
  vectorToPostgres,
} from "@/lib/ai";
import {
  alertEmailHtml,
  alertEmailSubject,
  maxItemsPerEmail,
} from "@/lib/alert-email";
import { buildProfileEmbeddingText } from "@/lib/opportunity-indexing";
import { listMatchingOpportunities } from "@/lib/opportunity-store";
import {
  hasStaleProfileEmbedding,
  refreshStaleProfileEmbeddings,
} from "@/lib/profile-embedding";
import { createClient } from "@/lib/supabase/server";
import { buildUnsubscribeUrls, unsubscribeHeaders } from "@/lib/unsubscribe";
import { getSearchCategories, isOpportunityCategory } from "@/lib/opportunities";
import { brazilianStateCodes, normalizeStates } from "@/lib/states";
import type { OpportunityCategory } from "@/lib/types";

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
  const { states } = normalizeStates(formData.getAll("states").map(String));
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
      states,
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

export type SendAlertState = { error?: string; notice?: string };

/** Intervalo mínimo entre envios imediatos do mesmo usuário. */
const sendAlertCooldownMs = 60_000;
/**
 * Último envio imediato por usuário. Fica na memória do servidor: protege
 * contra cliques repetidos, mas não é compartilhado entre instâncias.
 */
const lastAlertSentAt = new Map<string, number>();

/**
 * Envia agora, para o e-mail da conta, os editais relevantes do perfil (mesmo
 * matching, limiar e estados do painel). Serve para demonstração: não marca
 * nada como enviado, então o alerta diário automático segue igual.
 */
export async function sendAlertNowAction(): Promise<SendAlertState> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { error: "O envio de e-mails não está configurado (RESEND_API_KEY e RESEND_FROM_EMAIL)." };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: "Sua sessão expirou. Entre novamente." };
  const user = authData.user;
  if (!user.email) return { error: "Sua conta não tem um e-mail cadastrado." };

  const elapsed = Date.now() - (lastAlertSentAt.get(user.id) ?? 0);
  if (elapsed < sendAlertCooldownMs) {
    const seconds = Math.ceil((sendAlertCooldownMs - elapsed) / 1000);
    return { error: `Aguarde ${seconds} s para enviar de novo.` };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, categories, keywords, states, embedding_model, products_services")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return { error: "Não foi possível carregar seu perfil. Tente novamente." };
  }
  if (
    hasStaleProfileEmbedding(profile) &&
    (await refreshStaleProfileEmbeddings(supabase, [{ ...profile, id: user.id }])).length === 0
  ) {
    return {
      error: "O modelo de busca foi atualizado. Salve o perfil novamente antes de enviar.",
    };
  }
  if (!profile.embedding_model) {
    return {
      error: "Descreva os produtos e serviços (ou temas de interesse) e salve o perfil antes de enviar.",
    };
  }

  const { states } = normalizeStates(profile.states ?? []);
  let opportunities;
  try {
    opportunities = await listMatchingOpportunities(
      supabase,
      user.id,
      getSearchCategories({ categories: profile.categories as OpportunityCategory[] }),
      states.length > 0 ? states : brazilianStateCodes,
      minimumOpportunitySimilarity,
    );
  } catch (error) {
    console.error("Could not match opportunities for the immediate alert.", {
      userId: user.id,
      error: error && typeof error === "object" && "message" in error ? error.message : error,
    });
    return { error: "Não foi possível buscar os editais agora. Tente novamente." };
  }
  // Os mais relevantes primeiro, no mesmo limite do alerta diário.
  const relevant = opportunities
    .filter(({ matchScore }) => isAboveSemanticMatchThreshold(matchScore ?? Number.NaN))
    .slice(0, maxItemsPerEmail);
  if (relevant.length === 0) {
    return {
      notice: "Nenhum edital aberto atinge a similaridade mínima com seu perfil agora; nenhum e-mail foi enviado.",
    };
  }

  // Reserva o intervalo antes de enviar, para cliques simultâneos não duplicarem.
  lastAlertSentAt.set(user.id, Date.now());
  const resend = new Resend(process.env.RESEND_API_KEY);
  const unsubscribeUrls = buildUnsubscribeUrls(user.id);
  const { error: emailError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: user.email,
    subject: alertEmailSubject(relevant, { demo: true }),
    html: alertEmailHtml(profile.full_name || "Olá", relevant, {
      demo: true,
      unsubscribeUrl: unsubscribeUrls?.page,
    }),
    headers: unsubscribeHeaders(unsubscribeUrls),
  });
  if (emailError) {
    lastAlertSentAt.delete(user.id);
    console.error("Immediate opportunity email failed.", {
      userId: user.id,
      error: emailError.message,
    });
    return { error: "O provedor de e-mail recusou o envio. Tente novamente em instantes." };
  }

  return {
    notice: `E-mail enviado para ${user.email} com ${relevant.length} ${
      relevant.length === 1 ? "edital relevante" : "editais relevantes"
    }.`,
  };
}

/**
 * Registra ou revoga o consentimento para enviar o texto dos documentos ao
 * provedor de IA (LGPD, art. 7º, I). Sem ele, a análise de documentos fica
 * bloqueada.
 */
export async function setAiConsentAction(granted: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { error: "Sua sessão expirou. Entre novamente." };
  const { error } = await supabase
    .from("profiles")
    .update({ ai_consent_at: granted ? new Date().toISOString() : null })
    .eq("id", authData.user.id);
  if (error) return { error: "Não foi possível registrar sua escolha. Tente novamente." };
  revalidatePath("/conta");
  return {};
}

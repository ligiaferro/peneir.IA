"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAppUrl } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string };

/** Origem pública do app, usada nos links enviados por e-mail. */
async function getAppOrigin() {
  const configured = getAppUrl();
  if (configured) return configured;
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export async function signInAction(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Não foi possível entrar. Confira seus dados." };
  redirect("/dashboard");
}

export async function signUpAction(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // O cadastro é só de empresas; o tipo nunca vem do formulário.
  const userKind = "empresa";
  if (!fullName || !email || password.length < 8) {
    return {
      error: "Informe a razão social, o e-mail e uma senha com pelo menos 8 caracteres.",
    };
  }
  if (formData.get("accept_terms") !== "on") {
    return { error: "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade." };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "A criação de contas não está configurada no servidor." };
  }

  const { error: createError } = await createServiceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      user_kind: userKind,
      terms_accepted: "true",
    },
  });
  if (createError) {
    console.error("Could not create confirmed auth user.", {
      error: createError.message,
    });
    return { error: "Não foi possível criar a conta. Verifique os dados." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    console.error("Could not sign in newly created auth user.", {
      error: signInError.message,
    });
    return {
      error: "Conta criada, mas não foi possível iniciar a sessão. Entre com seu e-mail e senha.",
    };
  }

  redirect("/empresa");
}

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Não foi possível encerrar a sessão.");
  redirect("/login");
}

/**
 * Envia o link de redefinição de senha. A resposta é sempre a mesma, exista ou
 * não a conta, para não revelar quais e-mails estão cadastrados.
 */
export async function requestPasswordResetAction(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe o e-mail da sua conta." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getAppOrigin()}/auth/callback?next=/redefinir-senha`,
  });
  if (error) {
    // Limite de envios do Supabase e afins: registra sem expor ao usuário.
    console.error("Password reset request failed.", { error: error.message });
  }
  return {
    notice:
      "Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também a caixa de spam.",
  };
}

/** Define a nova senha. Exige a sessão aberta pelo link de recuperação. */
export async function updatePasswordAction(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  if (password.length < 8) {
    return { error: "A nova senha precisa ter pelo menos 8 caracteres." };
  }
  if (password !== confirmation) {
    return { error: "As senhas não coincidem." };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return { error: "O link expirou. Peça um novo link de recuperação." };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "A nova senha precisa ser diferente da anterior."
          : "Não foi possível atualizar a senha. Peça um novo link e tente de novo.",
    };
  }
  redirect("/dashboard");
}

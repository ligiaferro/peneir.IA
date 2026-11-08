"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string };

/** Origem pública do app, usada nos links enviados por e-mail. */
async function getAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
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
  const userKind =
    formData.get("user_kind") === "empresa" ? "empresa" : "pessoa";
  if (!fullName || !email || password.length < 8) {
    return {
      error: "Informe seu nome, e-mail e uma senha com pelo menos 8 caracteres.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, user_kind: userKind },
      emailRedirectTo: `${await getAppOrigin()}/auth/callback?next=${userKind === "empresa" ? "/empresa" : "/dashboard"}`,
    },
  });
  if (error) return { error: "Não foi possível criar a conta. Verifique os dados." };
  if (!data.session) {
    return {
      notice: "Conta criada. Confirme seu e-mail para acessar a plataforma.",
    };
  }
  redirect(userKind === "empresa" ? "/empresa" : "/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Não foi possível encerrar a sessão.");
  redirect("/login");
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type SessionUser = { id: string; email: string | undefined };

/**
 * Usuário da sessão para renderizar páginas. Valida a assinatura do JWT
 * localmente (chaves assimétricas do projeto, em cache por 10 min), sem a ida
 * ao Supabase Auth que `getUser()` faz a cada chamada. Ações que alteram dados
 * sensíveis continuam usando `getUser()`. O acesso aos dados segue protegido
 * pelas políticas RLS do banco.
 */
export async function getSessionUser(
  supabase: SupabaseClient<Database>,
): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
}

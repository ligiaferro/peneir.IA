import { createServiceClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

/** Desativa os alertas por e-mail de um usuário a partir de um link assinado. */
export async function unsubscribeWithToken(userId: string, token: string) {
  if (!verifyUnsubscribeToken(userId, token)) return "invalid" as const;
  const { error } = await createServiceClient()
    .from("profiles")
    .update({ email_alerts: false, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    console.error("Could not unsubscribe user from alerts.", { userId, error: error.message });
    return "error" as const;
  }
  return "done" as const;
}

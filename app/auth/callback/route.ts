import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

const emailOtpTypes: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (emailOtpTypes as readonly string[]).includes(value);
}

/**
 * Destino dos links enviados pelo Supabase Auth (confirmação de cadastro etc.).
 * Aceita os dois formatos:
 * - `?code=...` (PKCE, padrão do template do Supabase). Só funciona no mesmo
 *   navegador em que a conta foi criada, pois depende de um cookie local.
 * - `?token_hash=...&type=email` (template personalizado; funciona em qualquer
 *   dispositivo). Veja o README.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (code || (tokenHash && isEmailOtpType(type))) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash!,
          type: type as EmailOtpType,
        });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    console.error("Auth callback failed.", { error: error.message });
  }

  return NextResponse.redirect(new URL("/login?erro=confirmacao", request.url));
}

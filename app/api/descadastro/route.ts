import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeWithToken } from "@/lib/unsubscribe-user";

export const dynamic = "force-dynamic";

/**
 * Descadastro com um clique (RFC 8058): o provedor de e-mail envia POST para o
 * endereço do cabeçalho List-Unsubscribe.
 */
export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("u") ?? "";
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const result = await unsubscribeWithToken(userId, token);
  if (result === "invalid") {
    return NextResponse.json({ error: "Link de descadastro inválido." }, { status: 400 });
  }
  if (result === "error") {
    return NextResponse.json({ error: "Não foi possível concluir agora." }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}

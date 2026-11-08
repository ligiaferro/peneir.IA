import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Links de descadastro dos e-mails de alerta. O token é um HMAC do id do
 * usuário: permite desativar os alertas sem login, mas não pode ser forjado.
 */

function getSecret() {
  return process.env.UNSUBSCRIBE_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
}

export function createUnsubscribeToken(userId: string, secret = getSecret()) {
  if (!secret) throw new Error("Configure UNSUBSCRIBE_SECRET (ou CRON_SECRET).");
  return createHmac("sha256", secret).update(`unsubscribe:${userId}`).digest("base64url");
}

export function verifyUnsubscribeToken(userId: string, token: string, secret = getSecret()) {
  if (!secret || !userId || !token) return false;
  const expected = Buffer.from(createUnsubscribeToken(userId, secret));
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Endereços do descadastro: `page` (link no corpo do e-mail, pede confirmação)
 * e `oneClick` (cabeçalho List-Unsubscribe, RFC 8058). Null se faltar a URL do
 * app ou o segredo.
 */
export function buildUnsubscribeUrls(userId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!appUrl || !getSecret()) return null;
  const query = new URLSearchParams({ u: userId, t: createUnsubscribeToken(userId) });
  return {
    page: `${appUrl}/descadastro?${query}`,
    oneClick: `${appUrl}/api/descadastro?${query}`,
  };
}

/** Cabeçalhos que fazem Gmail/Outlook mostrarem o botão "Cancelar inscrição". */
export function unsubscribeHeaders(urls: { oneClick: string } | null): Record<string, string> {
  if (!urls) return {};
  return {
    "List-Unsubscribe": `<${urls.oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

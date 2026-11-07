/**
 * Aceita só caminhos internos (ex.: "/dashboard") como destino após o login,
 * evitando redirecionamento aberto para outros domínios ("//evil.com", "https://...").
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}

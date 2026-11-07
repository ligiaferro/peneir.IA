import { AuthForm } from "@/app/auth/auth-form";

const callbackErrors: Record<string, string> = {
  confirmacao:
    "Não foi possível concluir o acesso pelo link do e-mail. Se você já confirmou o cadastro, entre com seu e-mail e senha. Se o link expirou, cadastre-se novamente para receber outro.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string | string[] }>;
}) {
  const { erro } = await searchParams;
  const callbackError = typeof erro === "string" ? callbackErrors[erro] : undefined;
  return <AuthForm callbackError={callbackError} />;
}

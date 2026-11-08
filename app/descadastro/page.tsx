import type { Metadata } from "next";
import Link from "next/link";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { UnsubscribeForm } from "./unsubscribe-form";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Cancelar alertas | peneir.IA",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const { u = "", t = "" } = await searchParams;
  const valid = verifyUnsubscribeToken(u, t);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand" href="/">
          <BrandMark />
          peneir.IA
        </Link>
        {valid ? (
          <>
            <h1>Cancelar alertas por e-mail.</h1>
            <p>
              Você deixará de receber os resumos de novas oportunidades. Sua
              conta e seus documentos continuam disponíveis, e você pode
              reativar os alertas no seu perfil quando quiser.
            </p>
            {/* A confirmação evita que robôs de e-mail descadastrem só ao abrir o link. */}
            <UnsubscribeForm userId={u} token={t} />
          </>
        ) : (
          <>
            <h1>Link inválido.</h1>
            <p>
              Este link de descadastro não é válido. Você pode desativar os
              alertas a qualquer momento no seu perfil, depois de entrar.
            </p>
            <Link className="button" href="/login">
              Entrar
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

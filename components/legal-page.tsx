import Link from "next/link";
import type { ReactNode } from "react";

/** E-mail de contato para assuntos de privacidade (encarregado de dados). */
export function getContactEmail() {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;
}

export function ContactLine() {
  const email = getContactEmail();
  return email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <>o canal de atendimento informado na página inicial do serviço</>
  );
}

export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">p.</span>
          peneir.IA
        </Link>
        <div className="top-actions">
          <Link className="button button-secondary button-small" href="/dashboard">
            Ir para o painel
          </Link>
        </div>
      </header>
      <main className="main legal">
        <h1>{title}</h1>
        <p className="legal-updated">Última atualização: {updatedAt}</p>
        {children}
        <footer className="footer">
          <Link href="/privacidade">Política de Privacidade</Link> ·{" "}
          <Link href="/termos">Termos de Uso</Link>
        </footer>
      </main>
    </div>
  );
}

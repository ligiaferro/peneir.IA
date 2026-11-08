import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  acceptTermsFormAction,
  setAiConsentFormAction,
  setEmailAlertsFormAction,
} from "./actions";
import { DeleteAccountForm } from "./delete-account-form";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = { title: "Conta e privacidade | peneir.IA" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, user_kind, email_alerts, terms_accepted_at, ai_consent_at, created_at")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (error || !profile) {
    throw new Error("Não foi possível carregar sua conta. Confira se a migração 0009 foi executada.");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          <BrandMark />
          peneir.IA
        </Link>
        <div className="top-actions">
          <span className="user-chip">{authData.user.email}</span>
          {profile.user_kind === "empresa" && (
            <Link className="button button-secondary button-small" href="/empresa">
              Minha empresa
            </Link>
          )}
          <Link className="button button-secondary button-small" href="/dashboard">
            Oportunidades
          </Link>
          <form action={signOutAction}>
            <button className="button button-secondary button-small" type="submit">
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="main account">
        <div className="section-heading">
          <div>
            <h1>Conta e privacidade</h1>
            <p>
              {profile.full_name || authData.user.email} · conta criada em{" "}
              {formatDate(profile.created_at)}
            </p>
          </div>
        </div>

        <section className="panel account-panel">
          <h2>Alertas por e-mail</h2>
          <p className="panel-description">
            {profile.email_alerts
              ? "Ativos: você recebe um resumo das novas oportunidades compatíveis."
              : "Desativados: você não recebe e-mails de oportunidades."}
          </p>
          <form action={setEmailAlertsFormAction}>
            <input type="hidden" name="enabled" value={profile.email_alerts ? "false" : "true"} />
            <button className="button button-secondary button-small" type="submit">
              {profile.email_alerts ? "Desativar alertas" : "Ativar alertas"}
            </button>
          </form>
        </section>

        <section className="panel account-panel">
          <h2>Análise de documentos por IA</h2>
          <p className="panel-description">
            {profile.ai_consent_at
              ? `Autorizada em ${formatDate(profile.ai_consent_at)}. O texto dos documentos que você pedir para analisar é enviado ao provedor de IA.`
              : "Não autorizada. A análise de documentos fica indisponível até você autorizar; a leitura de editais públicos continua funcionando."}
          </p>
          <form action={setAiConsentFormAction}>
            <input type="hidden" name="granted" value={profile.ai_consent_at ? "false" : "true"} />
            <button className="button button-secondary button-small" type="submit">
              {profile.ai_consent_at ? "Revogar autorização" : "Autorizar análise por IA"}
            </button>
          </form>
        </section>

        <section className="panel account-panel">
          <h2>Termos e privacidade</h2>
          <p className="panel-description">
            {profile.terms_accepted_at
              ? `Você aceitou os termos em ${formatDate(profile.terms_accepted_at)}.`
              : "Não há registro de aceite dos termos para esta conta."}{" "}
            Leia a <Link href="/privacidade">Política de Privacidade</Link> e os{" "}
            <Link href="/termos">Termos de Uso</Link>.
          </p>
          {!profile.terms_accepted_at && (
            <form action={acceptTermsFormAction}>
              <button className="button button-small" type="submit">
                Li e aceito os termos
              </button>
            </form>
          )}
        </section>

        <section className="panel account-panel">
          <h2>Seus dados</h2>
          <p className="panel-description">
            Baixe uma cópia do seu perfil, dos dados dos seus documentos, dos
            vínculos com oportunidades e das análises (formato JSON). Os PDFs
            podem ser baixados na página de cada oportunidade ou da empresa.
          </p>
          <a className="button button-secondary button-small" href="/api/conta/exportar">
            Baixar meus dados
          </a>
        </section>

        <section className="panel account-panel account-danger">
          <h2>Excluir conta</h2>
          <p className="panel-description">
            Apaga definitivamente sua conta, seu perfil, seus documentos
            (arquivos incluídos), vínculos e análises. Não é possível desfazer.
          </p>
          <DeleteAccountForm />
        </section>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "./new-password-form";
import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = { title: "Nova senha | peneir.IA" };
export const dynamic = "force-dynamic";

export default async function NewPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Link className="brand" href="/">
            <BrandMark />
            peneir.IA
          </Link>
          <h1>Link expirado.</h1>
          <p>
            Este link de recuperação não é mais válido ou foi aberto em outro
            navegador. Peça um novo link para criar sua senha.
          </p>
          <Link className="button" href="/recuperar-senha">
            Pedir novo link
          </Link>
        </section>
      </main>
    );
  }
  return <NewPasswordForm email={data.user.email ?? ""} />;
}

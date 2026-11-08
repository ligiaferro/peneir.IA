"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type AuthState } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";

export function PasswordResetRequestForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordResetAction,
    {},
  );

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand" href="/">
          <BrandMark />
          peneir.IA
        </Link>
        <h1>Recuperar senha.</h1>
        <p>Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.</p>
        {state.notice ? (
          <p className="notice" role="status">{state.notice}</p>
        ) : (
          <form action={formAction}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
            <button className="button" type="submit" disabled={pending}>
              {pending ? "Enviando..." : "Enviar link"}
            </button>
          </form>
        )}
        <p className="auth-switch">
          Lembrou a senha? <Link href="/login">Entrar</Link>
        </p>
      </section>
    </main>
  );
}

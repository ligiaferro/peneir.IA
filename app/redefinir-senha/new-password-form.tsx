"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePasswordAction, type AuthState } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";

export function NewPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    updatePasswordAction,
    {},
  );

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand" href="/">
          <BrandMark />
          peneir.IA
        </Link>
        <h1>Crie uma nova senha.</h1>
        <p>Conta: {email}</p>
        <form action={formAction}>
          <div className="field">
            <label htmlFor="password">Nova senha</label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password_confirmation">Repita a nova senha</label>
            <input
              id="password_confirmation"
              name="password_confirmation"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>
          {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
          <button className="button" type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </section>
    </main>
  );
}

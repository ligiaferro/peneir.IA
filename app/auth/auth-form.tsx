"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, signUpAction, type AuthState } from "./actions";
import { BrandMark } from "@/components/brand-mark";

const initialState: AuthState = {};

export function AuthForm({
  callbackError,
  mode = "login",
}: {
  callbackError?: string;
  /** O cadastro é só de empresas; pessoas físicas ainda não têm acesso. */
  mode?: "login" | "company-signup";
}) {
  const isSignUp = mode === "company-signup";
  const [signInState, signInFormAction, signInPending] = useActionState(
    signInAction,
    initialState,
  );
  const [signUpState, signUpFormAction, signUpPending] = useActionState(
    signUpAction,
    initialState,
  );
  const state = isSignUp ? signUpState : signInState;
  const pending = isSignUp ? signUpPending : signInPending;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand" href="/">
          <BrandMark />
          peneir.IA
        </Link>
        <h1>{isSignUp ? "Cadastre sua empresa." : "Boas-vindas de volta."}</h1>
        <p>
          {isSignUp
            ? "Crie o acesso da empresa. Depois, complete os dados e acompanhe os documentos enviados para cada oportunidade."
            : "Entre para ver as licitações que combinam com a sua empresa."}
        </p>
        <form action={isSignUp ? signUpFormAction : signInFormAction}>
          {isSignUp && (
            <div className="field">
              <label htmlFor="full_name">Razão social ou nome da empresa</label>
              <input id="full_name" name="full_name" autoComplete="name" required />
            </div>
          )}
          {isSignUp && (
            <input type="hidden" name="user_kind" value="empresa" />
          )}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
            />
          </div>
          {isSignUp && (
            <label className="toggle-row terms-row">
              <input type="checkbox" name="accept_terms" required />
              <span>
                Li e aceito os <Link href="/termos" target="_blank">Termos de Uso</Link> e a{" "}
                <Link href="/privacidade" target="_blank">Política de Privacidade</Link>.
              </span>
            </label>
          )}
          {!isSignUp && (
            <p className="auth-forgot">
              <Link href="/recuperar-senha">Esqueci minha senha</Link>
            </p>
          )}
          {state.error && <p className="notice notice-error">{state.error}</p>}
          {!state.error && !state.notice && callbackError && (
            <p className="notice notice-error">{callbackError}</p>
          )}
          {state.notice && <p className="notice">{state.notice}</p>}
          <button className="button" type="submit" disabled={pending}>
            {pending ? "Aguarde..." : isSignUp ? "Criar conta" : "Entrar"}
          </button>
        </form>
        <p className="auth-switch">
          {isSignUp ? (
            <>
              Já tem uma conta? <Link href="/login">Entrar</Link>
            </>
          ) : (
            <>
              Ainda não tem uma conta? <Link href="/cadastro-empresa">Cadastre sua empresa</Link>
            </>
          )}
        </p>
        <p className="fine-print">
          Seus documentos ficam privados. A análise com IA só acontece quando
          você solicitar. <Link href="/privacidade">Privacidade</Link> ·{" "}
          <Link href="/termos">Termos</Link>
        </p>
      </section>
    </main>
  );
}

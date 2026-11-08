"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signInAction, signUpAction, type AuthState } from "./actions";

const initialState: AuthState = {};

export function AuthForm({
  callbackError,
  mode = "login",
}: {
  callbackError?: string;
  mode?: "login" | "signup" | "company-signup";
}) {
  const companyRegistration = mode === "company-signup";
  const [isSignUp, setIsSignUp] = useState(mode !== "login");
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
          <span className="brand-mark">p.</span>
          peneir.IA
        </Link>
        <h1>
          {companyRegistration
            ? "Cadastre sua empresa."
            : isSignUp
              ? "Encontre sua próxima oportunidade."
              : "Boas-vindas de volta."}
        </h1>
        <p>
          {companyRegistration
            ? "Crie o acesso da empresa. Depois, complete os dados e acompanhe os documentos enviados para cada oportunidade."
            : "Organize seu perfil e descubra oportunidades que combinam com seus objetivos."}
        </p>
        <form action={isSignUp ? signUpFormAction : signInFormAction}>
          {isSignUp && (
            <div className="field">
              <label htmlFor="full_name">{companyRegistration ? "Razão social ou nome da empresa" : "Nome"}</label>
              <input id="full_name" name="full_name" autoComplete="name" required />
            </div>
          )}
          {isSignUp && (
            <input
              type="hidden"
              name="user_kind"
              value={companyRegistration ? "empresa" : "pessoa"}
            />
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
          {state.error && <p className="notice notice-error">{state.error}</p>}
          {!state.error && !state.notice && callbackError && (
            <p className="notice notice-error">{callbackError}</p>
          )}
          {state.notice && <p className="notice">{state.notice}</p>}
          <button className="button" type="submit" disabled={pending}>
            {pending ? "Aguarde..." : isSignUp ? "Criar conta" : "Entrar"}
          </button>
        </form>
        {companyRegistration ? (
          <p className="auth-switch">
            Já tem uma conta? <Link href="/login">Entrar</Link>
          </p>
        ) : (
          <p className="auth-switch">
            {isSignUp ? "Já tem uma conta? " : "Ainda não tem uma conta? "}
            <button
              type="button"
              onClick={() => setIsSignUp((current) => !current)}
            >
              {isSignUp ? "Entrar" : "Cadastre-se"}
            </button>
          </p>
        )}
        {!companyRegistration && (
          <p className="auth-switch">
            {isSignUp ? "É uma empresa? " : "Representa uma empresa? "}
            <Link href="/cadastro-empresa">Cadastre sua empresa</Link>
          </p>
        )}
        <p className="fine-print">
          Seus documentos ficam privados. A análise com IA só acontece quando
          você solicitar.
        </p>
      </section>
    </main>
  );
}

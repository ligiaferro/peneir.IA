"use client";

import { useActionState } from "react";
import { sendAlertNowAction, type SendAlertState } from "@/app/actions";

/** Dispara na hora o e-mail de editais relevantes (para demonstração). */
export function SendAlertButton({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<SendAlertState, FormData>(
    sendAlertNowAction,
    {},
  );

  return (
    <form action={formAction} className="send-alert">
      <div className="send-alert-row">
        <p className="send-alert-text">
          O alerta por e-mail é enviado automaticamente todo dia. Para ver como
          ele chega, envie agora os editais mais relevantes para{" "}
          <strong>{email}</strong>.
        </p>
        <button
          className="button button-small"
          disabled={pending}
          type="submit"
        >
          {pending ? "Enviando..." : "Enviar e-mail agora"}
        </button>
      </div>
      {state.error && (
        <p className="notice notice-error" role="alert">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="notice" role="status">
          {state.notice}
        </p>
      )}
    </form>
  );
}

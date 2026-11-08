"use client";

import { useActionState } from "react";
import { unsubscribeAction, type UnsubscribeState } from "./actions";

export function UnsubscribeForm({ userId, token }: { userId: string; token: string }) {
  const [state, formAction, pending] = useActionState<UnsubscribeState, FormData>(
    unsubscribeAction,
    {},
  );

  if (state.status === "done") {
    return (
      <p className="notice" role="status">
        Pronto. Você não receberá mais alertas por e-mail.
      </p>
    );
  }
  return (
    <form action={formAction}>
      <input type="hidden" name="u" value={userId} />
      <input type="hidden" name="t" value={token} />
      {state.status && (
        <p className="notice notice-error" role="alert">
          Não foi possível cancelar agora. Tente novamente em instantes.
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Cancelando..." : "Cancelar alertas"}
      </button>
    </form>
  );
}

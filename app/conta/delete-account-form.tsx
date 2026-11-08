"use client";

import { useActionState } from "react";
import { deleteAccountAction, type DeleteAccountState } from "./actions";

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccountAction,
    {},
  );
  return (
    <form action={formAction} className="danger-form">
      <div className="field">
        <label htmlFor="confirmation">Digite EXCLUIR para confirmar</label>
        <input id="confirmation" name="confirmation" autoComplete="off" required />
      </div>
      {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
      <button className="button button-danger button-small" type="submit" disabled={pending}>
        {pending ? "Excluindo..." : "Excluir minha conta e meus dados"}
      </button>
    </form>
  );
}

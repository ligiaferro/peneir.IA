"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "@/app/actions";
import { categoryLabels } from "@/lib/opportunities";
import type { OpportunityCategory, UserProfile } from "@/lib/types";

const categories = Object.entries(categoryLabels) as [
  OpportunityCategory,
  string,
][];

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    {},
  );

  return (
    <form action={formAction}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="full_name">Nome ou razão social</label>
          <input
            id="full_name"
            name="full_name"
            defaultValue={profile.full_name}
            autoComplete="name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="user_kind">Meu perfil</label>
          <select id="user_kind" name="user_kind" defaultValue={profile.user_kind}>
            <option value="pessoa">Pessoa</option>
            <option value="empresa">Empresa</option>
          </select>
        </div>
      </div>
      <span className="field-label">Quais oportunidades quer acompanhar?</span>
      <p className="field-hint">
        Selecione ao menos uma categoria ou informe uma palavra-chave para
        continuar.
      </p>
      <div className="category-options">
        {categories.map(([category, label]) => (
          <label className="category-option" key={category}>
            <input
              type="checkbox"
              name="categories"
              value={category}
              defaultChecked={profile.categories.includes(category)}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="field">
        <label htmlFor="keywords">Palavras-chave (separadas por vírgula)</label>
        <input
          id="keywords"
          name="keywords"
          defaultValue={profile.keywords.join(", ")}
          placeholder="ex.: engenharia, saúde, Recife"
        />
      </div>
      <label className="toggle-row">
        <input
          type="checkbox"
          name="email_alerts"
          defaultChecked={profile.email_alerts}
        />
        Quero receber alertas de novas oportunidades por e-mail
      </label>
      {state.error && <p className="notice notice-error">{state.error}</p>}
      {state.notice && <p className="notice">{state.notice}</p>}
      <button className="button button-small" disabled={pending} type="submit">
        {pending ? "Salvando..." : "Salvar perfil"}
      </button>
    </form>
  );
}

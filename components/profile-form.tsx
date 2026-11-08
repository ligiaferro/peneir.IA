"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "@/app/actions";
import { StatePicker } from "@/components/state-picker";
import { categoryLabels } from "@/lib/opportunities";
import type { OpportunityCategory, UserProfile } from "@/lib/types";

const categories = Object.entries(categoryLabels) as [
  OpportunityCategory,
  string,
][];

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const userKind = profile.user_kind;
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
      </div>
      <fieldset className="state-picker">
      <legend className="field-label">Quais oportunidades quer acompanhar?</legend>
      <p className="field-hint">
        Selecione ao menos uma categoria ou informe uma palavra-chave para
        continuar. Sem categoria marcada, buscamos suas palavras-chave em todas
        as categorias.
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
      </fieldset>
      <div className="field">
        <label htmlFor="products_services">
          {userKind === "empresa"
            ? "Quais produtos ou serviços sua empresa fornece?"
            : "Produtos, serviços ou áreas de interesse"}
        </label>
        <textarea
          id="products_services"
          name="products_services"
          defaultValue={profile.products_services}
          maxLength={4000}
          rows={3}
          placeholder={
            userKind === "empresa"
              ? "ex.: fornecimento de refeições prontas, merenda escolar e serviços de alimentação coletiva"
              : "ex.: consultoria em tecnologia, manutenção predial, serviços de engenharia"
          }
          required={userKind === "empresa"}
        />
        <p className="field-hint">
          Usamos essa descrição para comparar semanticamente sua atividade com
          o objeto de cada oportunidade.
        </p>
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
      <StatePicker initial={profile.states} />
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

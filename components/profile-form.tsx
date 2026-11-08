"use client";

import { useActionState, useState, useTransition } from "react";
import {
  lookupCnpjAction,
  updateProfileAction,
  type CnpjLookupState,
  type ProfileState,
} from "@/app/actions";
import { StatePicker } from "@/components/state-picker";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";
import { categoryLabels } from "@/lib/opportunities";
import type { OpportunityCategory, UserProfile } from "@/lib/types";

const companySizeLabels = {
  ME: "Microempresa",
  EPP: "Empresa de pequeno porte",
  DEMAIS: "Demais portes",
} as const;

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

  // Campos controlados: a consulta de CNPJ preenche, mas tudo segue editável.
  const [fullName, setFullName] = useState(profile.full_name);
  const [productsServices, setProductsServices] = useState(profile.products_services);
  const [keywords, setKeywords] = useState(profile.keywords.join(", "));
  const [cnpj, setCnpj] = useState(profile.cnpj ? formatCnpj(profile.cnpj) : "");
  const [companySize, setCompanySize] = useState(profile.company_size ?? "");
  const [statePicker, setStatePicker] = useState({ key: 0, initial: profile.states });

  const [lookup, setLookup] = useState<CnpjLookupState | null>(null);
  const [lookingUp, startLookup] = useTransition();

  function searchCnpj() {
    setLookup(null);
    startLookup(async () => setLookup(await lookupCnpjAction(cnpj)));
  }

  function applyDraft() {
    if (!lookup?.draft || !lookup.company) return;
    const { draft, company } = lookup;
    setCnpj(company.cnpjFormatted);
    setFullName(draft.fullName);
    setProductsServices(draft.productsServices);
    setKeywords(draft.keywords.join(", "));
    setCompanySize(draft.size ?? "");
    if (draft.states.length > 0) {
      setStatePicker((current) => ({ key: current.key + 1, initial: draft.states }));
    }
    setLookup(null);
  }

  return (
    <form action={formAction}>
      {userKind === "empresa" && (
        <div className="field cnpj-field">
          <label htmlFor="cnpj">CNPJ (opcional)</label>
          <div className="cnpj-row">
            <input
              id="cnpj"
              name="cnpj"
              inputMode="numeric"
              autoComplete="off"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(event) => setCnpj(event.target.value)}
              maxLength={18}
            />
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={searchCnpj}
              disabled={lookingUp || !isValidCnpj(cnpj)}
            >
              {lookingUp ? "Buscando..." : "Buscar dados da empresa"}
            </button>
          </div>
          <p className="field-hint">
            Preenchemos o perfil com os dados públicos da Receita Federal
            (atividades, porte e estado). Você confere e edita tudo antes de
            salvar.
          </p>
          <input type="hidden" name="company_size" value={companySize} />
          {lookup?.error && (
            <p className="notice notice-error" role="alert">
              {lookup.error}
            </p>
          )}
          {lookup?.company && lookup.draft && (
            <div className="cnpj-card" role="status">
              <strong>{lookup.company.legalName}</strong>
              <span>
                {lookup.company.cnpjFormatted}
                {lookup.company.city && ` · ${lookup.company.city}`}
                {lookup.company.uf && `/${lookup.company.uf}`}
                {lookup.company.size && ` · ${companySizeLabels[lookup.company.size]}`}
              </span>
              {lookup.company.mainActivity && (
                <span>Atividade principal: {lookup.company.mainActivity}</span>
              )}
              {!lookup.company.active && (
                <span className="notice notice-error">
                  A situação cadastral desta empresa não está ativa na Receita.
                </span>
              )}
              <span className="field-hint">
                Vamos preencher nome, o que a empresa fornece, palavras-chave
                {lookup.draft.states.length > 0 && ` e o estado (${lookup.draft.states.join(", ")})`}
                {lookup.refinedByAi ? ", com texto sugerido por IA" : ""}. Isso
                substitui o que está nesses campos; nada é salvo até você
                clicar em &quot;Salvar perfil&quot;.
              </span>
              <div className="cnpj-actions">
                <button type="button" className="button button-small" onClick={applyDraft}>
                  Aplicar ao perfil
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => setLookup(null)}
                >
                  Descartar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="full_name">Nome ou razão social</label>
          <input
            id="full_name"
            name="full_name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
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
          value={productsServices}
          onChange={(event) => setProductsServices(event.target.value)}
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
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="ex.: engenharia, saúde, Recife"
        />
      </div>
      <StatePicker key={statePicker.key} initial={statePicker.initial} />
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

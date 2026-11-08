-- Busca paginada no painel, consentimentos (LGPD), releitura de editais
-- retificados e limpeza que preserva oportunidades com documentos vinculados.

-- ---------- Texto normalizado para busca (minúsculas, sem acentos) ----------
create or replace function public.normalize_search_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.translate(
    coalesce(p_value, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
  ));
$$;

-- ---------- Busca do painel: filtra, ordena e pagina no banco ----------
-- Devolve só a página pedida e o total de resultados (total_count).
create or replace function public.search_user_opportunities(
  p_user_id uuid,
  p_categories text[],
  p_regions text[],
  p_query text default null,
  p_deadline_before timestamptz default null,
  p_order text default 'relevancia',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (opportunity_id text, similarity real, total_count bigint)
language plpgsql
stable
security invoker
set search_path = public, extensions
set enable_indexscan = off
as $$
declare
  profile_embedding extensions.vector(1536);
  profile_model text;
  query_terms text[];
  result_limit integer := greatest(least(coalesce(p_limit, 24), 100), 1);
  result_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to match another user profile'
      using errcode = '42501';
  end if;

  select profiles.embedding, profiles.embedding_model
    into profile_embedding, profile_model
    from public.profiles
    where profiles.id = p_user_id;
  if profile_embedding is null then
    return;
  end if;

  -- Cada palavra da busca precisa aparecer (em qualquer ordem). Curingas do
  -- LIKE digitados pelo usuário são tratados como texto.
  select coalesce(array_agg(replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_')), '{}')
    into query_terms
    from unnest(regexp_split_to_array(public.normalize_search_text(btrim(coalesce(p_query, ''))), '\s+')) as term
    where term <> '';

  return query
    with matches as (
      select
        opportunities.id,
        (1 - (opportunities.embedding <=> profile_embedding))::real as score,
        opportunities.deadline,
        opportunities.published_at
      from public.opportunities
      where opportunities.index_status = 'indexed'
        and opportunities.embedding is not null
        and opportunities.embedding_model = profile_model
        and opportunities.embedding_input_version = 2
        and opportunities.closed_at is null
        and opportunities.deadline > now()
        and opportunities.category = any(coalesce(p_categories, '{}'::text[]))
        and coalesce(cardinality(p_regions), 0) > 0
        and opportunities.region = any(p_regions)
        and (p_deadline_before is null or opportunities.deadline <= p_deadline_before)
        and not exists (
          select 1
          from unnest(query_terms) as query_term
          where public.normalize_search_text(
            opportunities.title || ' ' || opportunities.organization || ' ' ||
            opportunities.location || ' ' || opportunities.summary
          ) not like '%' || query_term || '%'
        )
    )
    select matches.id, matches.score, count(*) over ()
    from matches
    order by
      case when p_order = 'prazo' then matches.deadline end asc nulls last,
      case when p_order = 'recentes' then matches.published_at end desc nulls last,
      matches.score desc,
      matches.id
    limit result_limit
    offset result_offset;
end;
$$;

revoke all on function public.search_user_opportunities(uuid, text[], text[], text, timestamptz, text, integer, integer)
  from public, anon;
grant execute on function public.search_user_opportunities(uuid, text[], text[], text, timestamptz, text, integer, integer)
  to authenticated, service_role;

-- ---------- Releitura de editais retificados ----------
alter table public.opportunity_editais
  add column if not exists checked_at timestamptz;

drop function if exists public.claim_edital_processing(text);

-- Com p_force, também reserva editais já lidos (usado quando o PNCP publica
-- arquivos novos, como uma retificação).
create function public.claim_edital_processing(
  p_opportunity_id text,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.opportunity_editais (opportunity_id, status)
  values (p_opportunity_id, 'processing')
  on conflict (opportunity_id) do nothing;
  if found then
    return true;
  end if;

  update public.opportunity_editais
  set status = 'processing', error = null, updated_at = now()
  where opportunity_id = p_opportunity_id
    and (
      status in ('failed', 'no_files')
      or (p_force and status in ('ready', 'no_text'))
      or (status = 'processing' and updated_at < now() - interval '10 minutes')
    );
  return found;
end;
$$;

revoke all on function public.claim_edital_processing(text, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_edital_processing(text, boolean)
  to service_role;

-- ---------- Limpeza que preserva o histórico dos usuários ----------
-- Apaga oportunidades encerradas há muito tempo, exceto as que têm documentos
-- vinculados ou análises (apagá-las removeria esse histórico em cascata).
-- Nas mantidas, descarta o JSON bruto do PNCP para economizar espaço.
create or replace function public.prune_old_opportunities(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.opportunities as opportunities
  where opportunities.deadline < p_cutoff
    and not exists (
      select 1 from public.document_opportunities as links
      where links.opportunity_id = opportunities.id
    )
    and not exists (
      select 1 from public.document_analyses as analyses
      where analyses.opportunity_id = opportunities.id
    );
  get diagnostics deleted_count = row_count;

  update public.opportunities
  set raw = null
  where deadline < p_cutoff and raw is not null;

  return deleted_count;
end;
$$;

revoke all on function public.prune_old_opportunities(timestamptz)
  from public, anon, authenticated;
grant execute on function public.prune_old_opportunities(timestamptz)
  to service_role;

-- ---------- Consentimentos (LGPD) ----------
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists ai_consent_at timestamptz;

-- Registra o aceite dos termos feito no formulário de cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, user_kind, categories, terms_accepted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.raw_user_meta_data ->> 'user_kind' = 'empresa' then 'empresa'
      else 'pessoa'
    end,
    array['licitacoes', 'concursos', 'doutorado', 'bolsas'],
    case
      when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then now()
    end
  );
  return new;
end;
$$;

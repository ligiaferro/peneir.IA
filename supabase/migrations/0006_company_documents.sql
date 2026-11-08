alter table public.documents
  add column opportunity_id text references public.opportunities (id) on delete set null;

create index documents_opportunity_idx
  on public.documents (user_id, opportunity_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, user_kind, categories)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.raw_user_meta_data ->> 'user_kind' = 'empresa' then 'empresa'
      else 'pessoa'
    end,
    array['licitacoes', 'concursos', 'doutorado', 'bolsas']
  );
  return new;
end;
$$;

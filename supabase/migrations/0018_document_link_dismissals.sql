-- Vínculos documento × requisito que a pessoa desfez. O relatório de
-- documentos por IA não os recria; um novo vínculo manual apaga o registro.
create table if not exists public.document_link_dismissals (
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null,
  opportunity_id text not null
    references public.opportunities (id) on delete cascade,
  requirement text not null check (length(requirement) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (document_id, opportunity_id, requirement),
  foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade
);

create index if not exists document_link_dismissals_user_opportunity_idx
  on public.document_link_dismissals (user_id, opportunity_id);

alter table public.document_link_dismissals enable row level security;

drop policy if exists "Users manage their own link dismissals"
  on public.document_link_dismissals;
create policy "Users manage their own link dismissals"
  on public.document_link_dismissals for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

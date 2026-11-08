alter table public.documents
  add constraint documents_id_user_id_unique unique (id, user_id);

create table public.document_opportunities (
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null,
  opportunity_id text not null references public.opportunities (id) on delete cascade,
  requirement text not null check (length(requirement) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (document_id, opportunity_id, requirement),
  foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade
);

create index document_opportunities_user_opportunity_idx
  on public.document_opportunities (user_id, opportunity_id);

create index document_opportunities_user_document_idx
  on public.document_opportunities (user_id, document_id);

alter table public.document_opportunities enable row level security;

create policy "Users manage their own opportunity document links"
  on public.document_opportunities for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into public.document_opportunities (
  user_id,
  document_id,
  opportunity_id,
  requirement
)
select
  documents.user_id,
  documents.id,
  documents.opportunity_id,
  documents.document_type
from public.documents
join public.opportunities
  on opportunities.id = documents.opportunity_id
on conflict do nothing;

insert into public.document_opportunities (
  user_id,
  document_id,
  opportunity_id,
  requirement
)
select
  analyses.user_id,
  analyses.document_id,
  analyses.opportunity_id,
  documents.document_type
from public.document_analyses as analyses
join public.documents
  on documents.id = analyses.document_id
  and documents.user_id = analyses.user_id
join public.opportunities
  on opportunities.id = analyses.opportunity_id
on conflict do nothing;

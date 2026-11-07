-- Oportunidades coletadas de fontes reais (ex.: PNCP).
-- As oportunidades de demonstração continuam no código e não são gravadas aqui.
create table public.opportunities (
  id text primary key,
  source text not null check (source in ('pncp')),
  external_id text not null,
  region text not null default '',
  category text not null
    check (category in ('licitacoes', 'concursos', 'doutorado', 'bolsas')),
  title text not null,
  organization text not null,
  location text not null default '',
  summary text not null default '',
  tags text[] not null default '{}',
  requirements text[] not null default '{}',
  requirements_are_generic boolean not null default false,
  deadline timestamptz not null,
  published_at timestamptz not null,
  source_url text not null,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index opportunities_open_idx
  on public.opportunities (category, deadline)
  where closed_at is null;

create index opportunities_sync_idx
  on public.opportunities (source, region, last_seen_at);

alter table public.opportunities enable row level security;

-- Dados públicos: qualquer usuário autenticado pode ler. Escrita apenas pelo
-- servidor, pelo cliente com `service_role` (que ignora RLS).
create policy "Authenticated users read opportunities"
  on public.opportunities for select to authenticated
  using (true);

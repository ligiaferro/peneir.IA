create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  user_kind text not null default 'pessoa' check (user_kind in ('empresa', 'pessoa')),
  categories text[] not null default '{}',
  keywords text[] not null default '{}',
  email_alerts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, categories)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    array['licitacoes', 'concursos', 'doutorado', 'bolsas']
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, full_name, categories)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', ''),
  array['licitacoes', 'concursos', 'doutorado', 'bolsas']
from auth.users
on conflict (id) do nothing;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  document_type text not null default 'Outro',
  expires_at date,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create table public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  opportunity_id text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, document_id, opportunity_id)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent')),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, opportunity_id)
);

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_analyses enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "Users manage their own profile"
  on public.profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users manage their own documents"
  on public.documents for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage their own analyses"
  on public.document_analyses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users read their own notification deliveries"
  on public.notification_deliveries for select to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 4194304, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 4194304,
    allowed_mime_types = array['application/pdf'];

create policy "Users upload documents to their private folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users read their private documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete their private documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.claim_opportunity_notification(
  p_user_id uuid,
  p_opportunity_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_deliveries (user_id, opportunity_id, status)
  values (p_user_id, p_opportunity_id, 'pending')
  on conflict (user_id, opportunity_id) do nothing;

  update public.notification_deliveries
  set status = 'sending', updated_at = now()
  where user_id = p_user_id
    and opportunity_id = p_opportunity_id
    and (
      status = 'pending'
      or (status = 'sending' and updated_at < now() - interval '15 minutes')
    );

  return found;
end;
$$;

revoke all on function public.claim_opportunity_notification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_opportunity_notification(uuid, text)
  to service_role;

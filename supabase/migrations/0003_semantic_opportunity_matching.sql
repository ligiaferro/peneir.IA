create schema if not exists extensions;
create extension if not exists vector with schema extensions;

alter table public.profiles
  add column products_services text not null default '',
  add column embedding extensions.vector(1536),
  add column embedding_model text,
  add column embedding_updated_at timestamptz;

alter table public.opportunities
  add column commercial_concepts text[] not null default '{}',
  add column embedding extensions.vector(1536),
  add column embedding_model text,
  add column index_status text not null default 'pending'
    check (index_status in ('pending', 'indexed', 'irrelevant', 'failed')),
  add column index_error text,
  add column indexed_at timestamptz;

create index opportunities_embedding_idx
  on public.opportunities using hnsw (embedding extensions.vector_cosine_ops)
  where index_status = 'indexed' and embedding is not null;

create index opportunities_pending_index_idx
  on public.opportunities (published_at, id)
  where index_status in ('pending', 'failed');

create or replace function public.match_user_opportunities(
  p_user_id uuid,
  p_categories text[],
  p_regions text[],
  p_min_similarity real default 0.4,
  p_limit integer default 100
)
returns table (opportunity_id text, similarity real)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  profile_embedding extensions.vector(1536);
  profile_model text;
  min_similarity real := greatest(least(coalesce(p_min_similarity, 0.4), 0.95), 0);
  result_limit integer := greatest(least(coalesce(p_limit, 100), 200), 1);
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

  return query
    select opportunities.id,
      (1 - (opportunities.embedding <=> profile_embedding))::real
    from public.opportunities
    where opportunities.index_status = 'indexed'
      and opportunities.embedding is not null
      and opportunities.embedding_model = profile_model
      and opportunities.closed_at is null
      and opportunities.deadline > now()
      and opportunities.category = any(coalesce(p_categories, '{}'::text[]))
      and coalesce(cardinality(p_regions), 0) > 0
      and opportunities.region = any(p_regions)
      and 1 - (opportunities.embedding <=> profile_embedding) >= min_similarity
    order by opportunities.embedding <=> profile_embedding
    limit result_limit;
end;
$$;

create or replace function public.match_opportunities_for_users(
  p_user_ids uuid[],
  p_regions text[],
  p_min_similarity real default 0.4,
  p_limit_per_user integer default 100,
  p_created_since timestamptz default null
)
returns table (user_id uuid, opportunity_id text, similarity real)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  min_similarity real := greatest(least(coalesce(p_min_similarity, 0.4), 0.95), 0);
  result_limit integer := greatest(least(coalesce(p_limit_per_user, 100), 200), 1);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required'
      using errcode = '42501';
  end if;

  return query
    select profiles.id,
      ranked.id,
      ranked.similarity
    from public.profiles
    cross join lateral (
      select opportunities.id,
        (1 - (opportunities.embedding <=> profiles.embedding))::real as similarity
      from public.opportunities
      where profiles.embedding is not null
        and opportunities.index_status = 'indexed'
        and opportunities.embedding is not null
        and opportunities.embedding_model = profiles.embedding_model
        and opportunities.closed_at is null
        and opportunities.deadline > now()
        and (
          p_created_since is null
          or opportunities.first_seen_at >= p_created_since
        )
        and (
          coalesce(cardinality(profiles.categories), 0) = 0
          or opportunities.category = any(profiles.categories)
        )
        and coalesce(cardinality(p_regions), 0) > 0
        and opportunities.region = any(p_regions)
        and 1 - (opportunities.embedding <=> profiles.embedding) >= min_similarity
      order by opportunities.embedding <=> profiles.embedding
      limit result_limit
    ) as ranked
    where profiles.id = any(coalesce(p_user_ids, '{}'::uuid[]));
end;
$$;

revoke all on function public.match_user_opportunities(uuid, text[], text[], real, integer)
  from public, anon;
revoke all on function public.match_opportunities_for_users(uuid[], text[], real, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.match_user_opportunities(uuid, text[], text[], real, integer)
  to authenticated, service_role;
grant execute on function public.match_opportunities_for_users(uuid[], text[], real, integer, timestamptz)
  to service_role;

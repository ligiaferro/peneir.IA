drop function public.match_user_opportunities(uuid, text[], text[], real, integer);

create function public.match_user_opportunities(
  p_user_id uuid,
  p_categories text[],
  p_regions text[],
  p_min_similarity real default -1,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (opportunity_id text, similarity real)
language plpgsql
stable
security invoker
set search_path = public, extensions
set enable_indexscan = off
as $$
declare
  profile_embedding extensions.vector(1536);
  profile_model text;
  min_similarity real := greatest(least(coalesce(p_min_similarity, -1), 0.95), -1);
  result_limit integer := greatest(least(coalesce(p_limit, 500), 500), 1);
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

  return query
    select opportunities.id,
      (1 - (opportunities.embedding <=> profile_embedding))::real
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
      and 1 - (opportunities.embedding <=> profile_embedding) >= min_similarity
    order by opportunities.embedding <=> profile_embedding, opportunities.id
    limit result_limit
    offset result_offset;
end;
$$;

revoke all on function public.match_user_opportunities(uuid, text[], text[], real, integer, integer)
  from public, anon;
grant execute on function public.match_user_opportunities(uuid, text[], text[], real, integer, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

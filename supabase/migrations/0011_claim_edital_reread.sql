create or replace function public.claim_edital_processing(
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
      status in ('failed', 'no_files', 'no_text')
      or (p_force and status in ('ready', 'no_text'))
      or (status = 'processing' and updated_at < now() - interval '10 minutes')
    );
  return found;
end;
$$;

create or replace function public.claim_edital_reread(p_opportunity_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.opportunity_editais
  set status = 'processing', error = null, updated_at = now()
  where opportunity_id = p_opportunity_id
    and status = 'ready';
  return found;
end;
$$;

revoke all on function public.claim_edital_reread(text)
  from public, anon, authenticated;
grant execute on function public.claim_edital_reread(text)
  to service_role;

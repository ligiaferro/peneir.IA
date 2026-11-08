-- Intervalo mínimo entre envios imediatos de alerta, compartilhado entre
-- instâncias do servidor (antes ficava na memória de cada instância).
alter table public.profiles
  add column if not exists last_immediate_alert_at timestamptz;

create or replace function public.claim_immediate_alert(p_cooldown_seconds integer default 60)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  if auth.uid() is null then
    return p_cooldown_seconds;
  end if;

  update public.profiles
  set last_immediate_alert_at = now()
  where id = auth.uid()
    and (
      last_immediate_alert_at is null
      or last_immediate_alert_at < now() - make_interval(secs => p_cooldown_seconds)
    );
  if found then
    return 0;
  end if;

  select last_immediate_alert_at into v_last from public.profiles where id = auth.uid();
  return greatest(
    1,
    ceil(p_cooldown_seconds - extract(epoch from (now() - coalesce(v_last, now()))))::integer
  );
end;
$$;

create or replace function public.release_immediate_alert()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_immediate_alert_at = null where id = auth.uid();
$$;

revoke all on function public.claim_immediate_alert(integer) from public, anon;
revoke all on function public.release_immediate_alert() from public, anon;
grant execute on function public.claim_immediate_alert(integer) to authenticated;
grant execute on function public.release_immediate_alert() to authenticated;

-- CNPJ e porte da empresa, preenchidos pela consulta pública de CNPJ no perfil
-- (opcionais: o perfil continua podendo ser editado e salvo à mão).
alter table public.profiles
  add column if not exists cnpj text
    check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  add column if not exists company_size text
    check (company_size is null or company_size in ('ME', 'EPP', 'DEMAIS'));

-- Intervalo mínimo entre consultas de CNPJ (chamam API pública e IA).
alter table public.profiles
  add column if not exists last_cnpj_lookup_at timestamptz;

create or replace function public.claim_cnpj_lookup(p_cooldown_seconds integer default 5)
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
  set last_cnpj_lookup_at = now()
  where id = auth.uid()
    and (
      last_cnpj_lookup_at is null
      or last_cnpj_lookup_at < now() - make_interval(secs => p_cooldown_seconds)
    );
  if found then
    return 0;
  end if;

  select last_cnpj_lookup_at into v_last from public.profiles where id = auth.uid();
  return greatest(
    1,
    ceil(p_cooldown_seconds - extract(epoch from (now() - coalesce(v_last, now()))))::integer
  );
end;
$$;

revoke all on function public.claim_cnpj_lookup(integer) from public, anon;
grant execute on function public.claim_cnpj_lookup(integer) to authenticated;

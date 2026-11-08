-- Estados (UFs) de atuação escolhidos pelo usuário. Vazio = todos os estados.
-- Idempotente: versões anteriores desta migração podem já ter sido aplicadas
-- com os nomes 0003_profile_states.sql ou 0006_profile_states.sql.
alter table public.profiles
  add column if not exists states text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_states_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_states_valid check (
        states <@ array[
          'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
          'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
          'SE', 'SP', 'TO'
        ]::text[]
      );
  end if;
end;
$$;

-- O painel filtra oportunidades abertas por UF.
create index if not exists opportunities_open_region_idx
  on public.opportunities (region, category, deadline)
  where closed_at is null;

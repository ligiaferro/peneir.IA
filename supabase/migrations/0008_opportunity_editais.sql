-- Leitura dos arquivos do edital (PDF, inclusive dentro de ZIP) e o que a IA
-- extraiu deles. Fica fora de `opportunities` porque a coleta diária regrava
-- aquela linha (incluindo os requisitos genéricos) a cada execução.
create table public.opportunity_editais (
  opportunity_id text primary key
    references public.opportunities (id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'no_files', 'no_text', 'failed')),
  -- Arquivos considerados: título, tipo, nome, link e resultado da leitura.
  files jsonb not null default '[]',
  -- Resumo, pontos-chave, requisitos detalhados e alertas (formato EditalInsights).
  insights jsonb,
  -- Nomes dos documentos exigidos, usados como campos de envio na oportunidade.
  requirements text[] not null default '{}',
  text_length integer,
  model text,
  error text,
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.opportunity_editais enable row level security;

-- Dados públicos do edital: qualquer usuário autenticado lê; só o servidor
-- (service_role) grava.
create policy "Authenticated users read opportunity editais"
  on public.opportunity_editais for select to authenticated
  using (true);

-- Reserva a leitura de um edital para uma única execução. Libera de novo
-- leituras que falharam, editais sem arquivos (podem ser publicados depois) e
-- reservas abandonadas há mais de 10 minutos.
create or replace function public.claim_edital_processing(p_opportunity_id text)
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
      status in ('failed', 'no_files')
      or (status = 'processing' and updated_at < now() - interval '10 minutes')
    );
  return found;
end;
$$;

revoke all on function public.claim_edital_processing(text)
  from public, anon, authenticated;
grant execute on function public.claim_edital_processing(text)
  to service_role;

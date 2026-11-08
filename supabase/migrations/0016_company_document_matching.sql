-- Arquivo de documentos da empresa e cruzamento automático com os editais.

-- Texto extraído do PDF no envio, reaproveitado pela IA ao comparar os
-- documentos da empresa com as exigências de cada edital.
alter table public.documents
  add column if not exists extracted_text text,
  add column if not exists text_extracted_at timestamptz;

-- Vínculos criados pela IA guardam o grau de encaixe e a explicação.
alter table public.document_opportunities
  add column if not exists added_by text not null default 'user'
    check (added_by in ('user', 'ai')),
  add column if not exists ai_fit text
    check (ai_fit is null or ai_fit in ('total', 'parcial')),
  add column if not exists ai_explanation text
    check (ai_explanation is null or length(ai_explanation) <= 2000);

-- Relatório por usuário e oportunidade: como cada documento da empresa se
-- encaixa nas exigências extraídas do edital.
create table if not exists public.opportunity_document_reports (
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id text not null
    references public.opportunities (id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  -- Formato DocumentReport (lib/document-report.ts).
  result jsonb,
  -- Resumo do edital e dos documentos usados; muda quando algum deles muda.
  signature text,
  model text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table public.opportunity_document_reports enable row level security;

drop policy if exists "Users manage their own document reports"
  on public.opportunity_document_reports;
create policy "Users manage their own document reports"
  on public.opportunity_document_reports for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Reserva a geração do relatório para uma única execução. Libera relatórios
-- desatualizados (assinatura diferente), que falharam, pedidos explícitos e
-- reservas abandonadas há mais de 5 minutos.
create or replace function public.claim_document_report(
  p_opportunity_id text,
  p_signature text,
  p_force boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.opportunity_document_reports (
    user_id, opportunity_id, status, signature
  )
  values (v_user_id, p_opportunity_id, 'processing', p_signature)
  on conflict (user_id, opportunity_id) do nothing;
  if found then
    return true;
  end if;

  update public.opportunity_document_reports
  set status = 'processing', error = null, signature = p_signature, updated_at = now()
  where user_id = v_user_id
    and opportunity_id = p_opportunity_id
    and (
      (status = 'processing' and updated_at < now() - interval '5 minutes')
      or (
        status <> 'processing'
        and (p_force or status = 'failed' or signature is distinct from p_signature)
      )
    );
  return found;
end;
$$;

revoke all on function public.claim_document_report(text, text, boolean)
  from public, anon;
grant execute on function public.claim_document_report(text, text, boolean)
  to authenticated;

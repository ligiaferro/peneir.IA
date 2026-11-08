-- Preferência do e-mail enviado quando a IA conclui o relatório de uma vaga
-- (leitura do edital e status dos documentos). Ativo por padrão; a pessoa
-- desativa na página Conta.
alter table public.profiles
  add column if not exists report_emails boolean not null default true;

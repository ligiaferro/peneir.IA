# peneir.IA

MVP genérico para encontrar oportunidades públicas (licitações, concursos, doutorado e bolsas), comparar requisitos com o perfil/documentos do usuário e avisar sobre novas correspondências. Licitações vêm do [PNCP](https://pncp.gov.br/) (Portal Nacional de Contratações Públicas); concursos, doutorados e bolsas ainda usam dados de demonstração.

## Stack

- Next.js + TypeScript
- Supabase Auth, Postgres com Row Level Security (RLS) e Storage privado
- OpenAI Responses API para análise assistida de PDF
- Resend para alertas
- API de consulta do PNCP para licitações
- Vercel Cron para a coleta e os alertas diários

## Configuração local

1. Instale Node.js 20.9+ e execute `npm install`.
2. Crie um projeto Supabase e obtenha a URL e a chave pública em **Settings → API Keys**.
3. Execute, em ordem, `supabase/migrations/0001_initial_schema.sql` e `supabase/migrations/0002_opportunities.sql` no **SQL Editor** do projeto.
4. Crie `.env.local` a partir de `.env.example`. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Configure `SUPABASE_SERVICE_ROLE_KEY` com a chave secreta do projeto para os crons de coleta e de alertas; ela só é usada no servidor e nunca deve usar o prefixo `NEXT_PUBLIC_`.
5. Em **Authentication → URL Configuration** do Supabase, defina a **Site URL** (`http://localhost:3000` no desenvolvimento, o domínio público em produção) e inclua `http://localhost:3000/auth/callback` e `https://<seu-domínio>/auth/callback` em **Redirect URLs**. O cadastro envia o link de confirmação para `/auth/callback`, que abre a sessão e leva ao painel; por isso `NEXT_PUBLIC_APP_URL` deve apontar para a URL pública do app. Para a demonstração, você pode desativar a confirmação de e-mail; em produção, mantenha a confirmação habilitada.

   O link padrão do Supabase usa PKCE e só abre a sessão no mesmo navegador em que a conta foi criada (em outro dispositivo, o e-mail é confirmado, mas a pessoa precisa entrar com a senha). Para funcionar em qualquer dispositivo, troque o link do template **Confirm signup** em **Authentication → Emails** por `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/dashboard`.
6. Configure `RESEND_FROM_EMAIL` com um remetente/domínio verificado no Resend e `OPENAI_API_KEY` para habilitar a análise. Para usar um endpoint compatível com a API da OpenAI, defina `OPENAI_BASE_URL` (opcional). Não é necessário configurar IA para consultar oportunidades.
7. Rode `npm run dev` e abra `http://localhost:3000`.

As operações de usuários usam o cliente Supabase com a sessão autenticada e as políticas RLS. A chave `SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente pelos crons, para gravar as oportunidades coletadas, listar contas autenticadas e processar alertas; ela ignora RLS, portanto mantenha-a privada e limitada a ambientes de servidor.

Sem as variáveis públicas do Supabase, a aplicação não consegue autenticar, acessar o Storage nem consultar o banco. Os crons também precisam de `SUPABASE_SERVICE_ROLE_KEY`. As integrações OpenAI e Resend falham explicitamente quando solicitadas sem configuração.

## Fluxo do MVP

1. Cadastre-se e escolha ao menos uma categoria ou palavra-chave do que está buscando (sem categoria marcada, as palavras-chave são buscadas em todas as categorias). O mesmo perfil atende empresas e pessoas.
2. Com base no perfil, veja sugestões de tipos de documentos e envie pelo menos um PDF próprio (máximo de 4 MB) para liberar as oportunidades compatíveis.
3. Consulte as oportunidades (até 30 por vez, das mais recentes; refine com palavras-chave) e abra a análise de requisitos. Para licitações do PNCP, a API não informa os requisitos do edital: o card mostra os requisitos usuais de habilitação da Lei 14.133/2021 e a análise avisa que o edital pode exigir outros documentos. O conteúdo do PDF é enviado à OpenAI somente quando você solicita uma análise; os resultados são sugestões, não uma decisão jurídica ou de habilitação.
4. O alerta diário envia um único e-mail por usuário com as oportunidades compatíveis de fontes reais (itens de demonstração não são enviados) vistas pela primeira vez nos últimos 3 dias e ainda dentro do prazo (até 20 listadas; o restante fica no painel). O banco deduplica por usuário e oportunidade e recupera reservas de envio abandonadas após 15 minutos.

## Agendamento

`vercel.json` configura duas chamadas diárias (horários em UTC):

- `/api/cron/sync-opportunities` (10h): coleta no PNCP as contratações com recebimento de propostas aberto nas UFs de `PNCP_UFS` (padrão `PE`) e prazo até `PNCP_DAYS_AHEAD` dias (padrão 60), grava em `public.opportunities` e marca como encerradas as que saíram da listagem. A API do PNCP limita requisições (HTTP 429), então as páginas são lidas em sequência com pausa de 1,5 s e retentativas; cada UF leva cerca de 2 s por página de 50 itens (PE: ~14 páginas, ~30 s). `PNCP_MAX_PAGES` (padrão 20) limita páginas por UF; se a listagem não for lida inteira, nada é encerrado naquela UF. A função tem `maxDuration` de 300 s, então inclua poucas UFs por execução.
- `/api/cron/opportunities` (12h): envia os alertas por e-mail.

Em produção, configure `CRON_SECRET` no ambiente da Vercel; os endpoints exigem `Authorization: Bearer <CRON_SECRET>`. Ambos usam o cliente Supabase com `SUPABASE_SERVICE_ROLE_KEY` no servidor; o de alertas usa o Resend para entrega. Em desenvolvimento, acione-os manualmente, por exemplo:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-opportunities
```

## Verificações

- `npm test` executa testes unitários de compatibilidade, seleção de oportunidades e do cliente do PNCP.
- `npm run lint` executa ESLint.
- `npm run build` valida a compilação de produção.

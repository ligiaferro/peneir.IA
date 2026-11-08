# peneir.IA

MVP para encontrar licitações públicas do [PNCP](https://pncp.gov.br/) (Portal Nacional de Contratações Públicas), comparar requisitos com os documentos do usuário e avisar sobre novas correspondências. Oportunidades sem fonte real conectada não são exibidas.

## Stack

- Next.js + TypeScript
- Supabase Auth, Postgres com Row Level Security (RLS) e Storage privado
- OpenAI Chat Completions para análise assistida de texto extraído de PDFs
- Resend para alertas
- API de consulta do PNCP para licitações
- Vercel Cron para a coleta e os alertas diários

## Configuração local

1. Instale Node.js 20.9+ e execute `npm install`.
2. Crie um projeto Supabase e obtenha a URL e a chave pública em **Settings → API Keys**.
3. Configure `.env.local` a partir de `.env.example`, incluindo `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `DATABASE_URL` com uma URI de conexão Postgres do Supabase. O usuário do banco precisa ter permissão para criar tabelas, funções e políticas; use a conexão direta ou um pooler de sessão. A aplicação executa migrações pendentes ao iniciar.
4. Configure `SUPABASE_SERVICE_ROLE_KEY` com a chave secreta do projeto para os crons e para persistir/indexar as oportunidades consultadas ao vivo no painel; ela só é usada no servidor e nunca deve usar o prefixo `NEXT_PUBLIC_`.
5. Em **Authentication → URL Configuration** do Supabase, defina a **Site URL** (`http://localhost:3000` no desenvolvimento, o domínio público em produção) e inclua `http://localhost:3000/auth/callback` e `https://<seu-domínio>/auth/callback` em **Redirect URLs**. O cadastro envia o link de confirmação para `/auth/callback`, que abre a sessão e leva ao painel; por isso `NEXT_PUBLIC_APP_URL` deve apontar para a URL pública do app. Para a demonstração, você pode desativar a confirmação de e-mail; em produção, mantenha a confirmação habilitada.

   O link padrão do Supabase usa PKCE e só abre a sessão no mesmo navegador em que a conta foi criada (em outro dispositivo, o e-mail é confirmado, mas a pessoa precisa entrar com a senha). Para funcionar em qualquer dispositivo, troque o link do template **Confirm signup** em **Authentication → Emails** por `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/dashboard`.
6. Configure `RESEND_FROM_EMAIL` com um remetente/domínio verificado no Resend e `OPENAI_API_KEY` para habilitar análise e busca semântica. A busca requer que `OPENAI_BASE_URL` aceite `/embeddings` e o parâmetro `dimensions: 1536`; Chat Completions é usado apenas quando alguém solicita análise de documento. `OPENAI_EMBEDDING_MODEL` define o modelo de vetores (padrão `text-embedding-3-small`). O perfil e os textos de origem das licitações são vetorizados com esse mesmo modelo e dimensão. PDFs digitalizados sem texto selecionável precisam de OCR antes da análise.
7. Rode `npm run dev` e abra `http://localhost:3000`.

As migrações são aplicadas no início do servidor Node.js em uma transação protegida por advisory lock, com histórico em `public.app_schema_migrations`. Em schemas já existentes, a aplicação reconhece e registra `0001_initial_schema.sql` se o schema base estiver completo antes de aplicar novas migrações. Configure `DATABASE_URL` nos ambientes de desenvolvimento e produção com a URI PostgreSQL do Supabase (a conexão direta ou pooler de sessão, com SSL); sem ela, o servidor não inicia. Os arquivos SQL são incluídos nas funções de produção. As operações de usuários usam o cliente Supabase com a sessão autenticada e as políticas RLS. A chave `SUPABASE_SERVICE_ROLE_KEY` é usada pelos crons para gravar as oportunidades coletadas, listar contas autenticadas e processar alertas, e pelo painel para persistir os resultados PNCP consultados ao vivo; ela ignora RLS, portanto mantenha-a privada e limitada a ambientes de servidor.

Sem as variáveis públicas do Supabase, a aplicação não consegue autenticar, acessar o Storage nem consultar o banco. Os crons também precisam de `SUPABASE_SERVICE_ROLE_KEY`. As integrações OpenAI e Resend falham explicitamente quando solicitadas sem configuração.

## Fluxo do MVP

1. Pessoas podem se cadastrar pela tela de acesso. Empresas têm uma tela própria em `/cadastro-empresa`; depois do cadastro, os dados e documentos ficam disponíveis em `/empresa`.
2. Descreva os produtos e serviços fornecidos pela empresa e escolha categorias e palavras-chave. Clique em uma oportunidade para abrir sua página de detalhes e envie um PDF (até 4 MB) no campo de cada documento solicitado. Cada arquivo fica associado à oportunidade e ao requisito escolhido. A página da empresa reúne os documentos enviados e os documentos usados em análises, com edição dos metadados e remoção.
3. O sistema gera embeddings diretamente do título, objeto/resumo e tags de origem de cada licitação do PNCP, sem uma chamada de Chat Completions por oportunidade. O perfil da empresa também é vetorizado; o painel mostra todas as licitações ativas e indexadas nas categorias e UFs selecionadas, sem corte mínimo de similaridade, ordenadas por score. Cada card informa a similaridade semântica em porcentagem e destaca scores acima de 80% como **Ótima match**; esse score não representa probabilidade de contratação ou habilitação. Itens sem vetor válido não são exibidos. As migrações criam os campos, extensão e função pgvector. Ao carregar o painel com Licitações selecionada, o servidor consulta a primeira página do PNCP nas UFs de `PNCP_UFS` e persiste/indexa as oportunidades ainda não processadas (requer `SUPABASE_SERVICE_ROLE_KEY`), mesmo que o usuário ainda não tenha enviado documentos ou gerado o vetor do perfil. O painel libera as oportunidades depois que o perfil é vetorizado; documentos são enviados por oportunidade, sem bloquear a busca. A busca também tenta processar lotes pendentes já salvos. Se o PNCP ou a indexação falhar, os resultados válidos já salvos continuam disponíveis e o painel exibe um aviso. Para licitações, o card mostra requisitos usuais de habilitação (a API do PNCP não informa os requisitos completos do edital). O texto extraído do PDF só é enviado ao endpoint de IA quando você solicita uma análise.
4. O alerta diário envia um único e-mail por usuário com oportunidades semanticamente compatíveis vistas pela primeira vez nos últimos 3 dias e ainda dentro do prazo (até 20 listadas; o restante fica no painel). O banco deduplica por usuário e oportunidade e recupera reservas de envio abandonadas após 15 minutos.

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

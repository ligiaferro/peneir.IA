# peneir.IA

MVP genérico para encontrar oportunidades públicas (licitações, concursos, doutorado e bolsas), comparar requisitos com o perfil/documentos do usuário e avisar sobre novas correspondências. A busca usa dados mockados nesta fase.

## Stack

- Next.js + TypeScript
- Supabase Auth, Postgres com Row Level Security (RLS) e Storage privado
- OpenAI Responses API para análise assistida de PDF
- Resend para alertas
- Vercel Cron para a busca diária

## Configuração local

1. Instale Node.js 20.9+ e execute `npm install`.
2. Crie um projeto Supabase e obtenha a URL e a chave pública em **Settings → API Keys**.
3. Execute `supabase/migrations/0001_initial_schema.sql` no **SQL Editor** do projeto.
4. Crie `.env.local` a partir de `.env.example`. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Configure `SUPABASE_SERVICE_ROLE_KEY` com a chave secreta do projeto para o cron de alertas; ela só é usada no servidor e nunca deve usar o prefixo `NEXT_PUBLIC_`.
5. No Supabase Auth, configure a URL local `http://localhost:3000` como URL de redirecionamento. Para a demonstração, você pode desativar a confirmação de e-mail; em produção, mantenha a confirmação habilitada.
6. Configure `RESEND_FROM_EMAIL` com um remetente/domínio verificado no Resend e `OPENAI_API_KEY` para habilitar a análise. Para usar um endpoint compatível com a API da OpenAI, defina `OPENAI_BASE_URL` (opcional). Não é necessário configurar IA para usar a busca mockada.
7. Rode `npm run dev` e abra `http://localhost:3000`.

As operações de usuários usam o cliente Supabase com a sessão autenticada e as políticas RLS. A chave `SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente pelo cron para listar contas autenticadas e processar alertas; ela ignora RLS, portanto mantenha-a privada e limitada a ambientes de servidor.

Sem as variáveis públicas do Supabase, a aplicação não consegue autenticar, acessar o Storage nem consultar o banco. O cron também precisa de `SUPABASE_SERVICE_ROLE_KEY`. As integrações OpenAI e Resend falham explicitamente quando solicitadas sem configuração.

## Fluxo do MVP

1. Cadastre-se e escolha ao menos uma categoria ou palavra-chave do que está buscando. O mesmo perfil atende empresas e pessoas.
2. Com base no perfil, veja sugestões de tipos de documentos e envie pelo menos um PDF próprio (máximo de 4 MB) para liberar as oportunidades compatíveis.
3. Consulte as oportunidades de demonstração e abra a análise de requisitos. O conteúdo do PDF é enviado à OpenAI somente quando você solicita uma análise; os resultados são sugestões, não uma decisão jurídica ou de habilitação.
4. O alerta diário envia por e-mail oportunidades mockadas compatíveis ainda dentro do prazo. O primeiro ciclo pode enviar todas as oportunidades ativas do conjunto de demonstração; o banco deduplica por usuário e oportunidade e recupera reservas de envio abandonadas após 15 minutos.

## Agendamento

`vercel.json` configura uma chamada diária ao endpoint `/api/cron/opportunities`. Em produção, configure `CRON_SECRET` no ambiente da Vercel; o endpoint exige `Authorization: Bearer <CRON_SECRET>`. O cron usa o cliente Supabase com `SUPABASE_SERVICE_ROLE_KEY` no servidor e o Resend para entrega. Em desenvolvimento, a rota pode ser acionada manualmente com esse mesmo cabeçalho.

## Verificações

- `npm test` executa testes unitários de compatibilidade e seleção de oportunidades.
- `npm run lint` executa ESLint.
- `npm run build` valida a compilação de produção.

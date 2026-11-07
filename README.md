# peneir.IA

MVP genérico para encontrar oportunidades públicas (licitações, concursos, doutorado e bolsas), comparar requisitos com o perfil/documentos do usuário e avisar sobre novas correspondências. A busca usa dados mockados nesta fase.

## Stack

- Next.js + TypeScript
- Supabase Auth e Storage privado; Postgres acessado pelo servidor via URI de conexão
- OpenAI Responses API para análise assistida de PDF
- Resend para alertas
- Vercel Cron para a busca diária

## Configuração local

1. Instale Node.js 20.9+ e execute `npm install`.
2. No Supabase, use **Connect → Session pooler** no desenvolvimento local (ou **Transaction pooler** em funções serverless) e copie a URI PostgreSQL do usuário `postgres`.
3. Execute `supabase/migrations/0001_initial_schema.sql` no **SQL Editor** do projeto.
4. Crie `.env.local` a partir de `.env.example`. Cole a URI completa em `DATABASE_URL`, substituindo qualquer marcador de senha pelo valor do banco. Configure também `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` com os valores de **Settings → API Keys**.
5. No Supabase Auth, configure a URL local `http://localhost:3000` como URL de redirecionamento. Para a demonstração, você pode desativar a confirmação de e-mail; em produção, mantenha a confirmação habilitada.
6. Configure `RESEND_FROM_EMAIL` com um remetente/domínio verificado no Resend e `OPENAI_API_KEY` para habilitar a análise. Não é necessário configurar IA para usar a busca mockada.
7. Rode `npm run dev` e abra `http://localhost:3000`.

Preserve os parâmetros SSL fornecidos pelo Supabase e codifique caracteres especiais da senha na URI. O app normaliza `sslmode=require`, `prefer` ou `verify-ca` para `verify-full`, mantendo a verificação SSL atual e evitando o aviso de compatibilidade do driver. Se a conexão direta acusar um certificado autoassinado, baixe o certificado CA em **Settings → Database → SSL Configuration**, salve-o localmente (por exemplo, em `supabase/prod-ca-2021.crt`) e informe seu caminho em `DATABASE_SSL_ROOT_CERT_PATH`. `DATABASE_URL` contém a senha do banco: é secreta e só é usada pelo servidor; nunca use o prefixo `NEXT_PUBLIC_` nela. As consultas do usuário abrem uma transação e aplicam o contexto RLS antes de acessar os dados. A URL e a chave pública da API continuam necessárias para Supabase Auth, atualização de sessão e Storage privado; a chave `service_role` não é necessária para esta arquitetura.

Sem `DATABASE_URL`, a aplicação não consegue ler nem gravar no Postgres. Sem as variáveis públicas do Supabase, não consegue autenticar nem acessar o Storage. As integrações OpenAI e Resend falham explicitamente quando solicitadas sem configuração.

## Fluxo do MVP

1. Cadastre-se e escolha ao menos uma categoria ou palavra-chave do que está buscando. O mesmo perfil atende empresas e pessoas.
2. Com base no perfil, veja sugestões de tipos de documentos e envie pelo menos um PDF próprio (máximo de 4 MB) para liberar as oportunidades compatíveis.
3. Consulte as oportunidades de demonstração e abra a análise de requisitos. O conteúdo do PDF é enviado à OpenAI somente quando você solicita uma análise; os resultados são sugestões, não uma decisão jurídica ou de habilitação.
4. O alerta diário envia por e-mail oportunidades mockadas compatíveis ainda dentro do prazo. O primeiro ciclo pode enviar todas as oportunidades ativas do conjunto de demonstração; o banco deduplica por usuário e oportunidade e recupera reservas de envio abandonadas após 15 minutos.

## Agendamento

`vercel.json` configura uma chamada diária ao endpoint `/api/cron/opportunities`. Em produção, configure `CRON_SECRET` no ambiente da Vercel; o endpoint exige `Authorization: Bearer <CRON_SECRET>`. O cron acessa Postgres pela mesma `DATABASE_URL` no servidor e usa o Resend para entrega. Em desenvolvimento, a rota pode ser acionada manualmente com esse mesmo cabeçalho.

## Verificações

- `npm test` executa testes unitários de compatibilidade e seleção de oportunidades.
- `npm run lint` executa ESLint.
- `npm run build` valida a compilação de produção.

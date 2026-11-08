import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "peneir.IA | O edital certo, antes do prazo",
  description:
    "A peneir.IA acompanha as licitações do PNCP, compara cada edital com o que sua empresa oferece usando IA e avisa só o que combina com seu negócio e seus estados de atuação.",
};

export const dynamic = "force-dynamic";

/* Ícones de traço simples, herdando a cor do texto. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="lp-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

const icons = {
  spark: (
    <Icon>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </Icon>
  ),
  map: (
    <Icon>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </Icon>
  ),
  mail: (
    <Icon>
      <rect height="14" rx="2.5" width="18" x="3" y="5" />
      <path d="m4 7 8 6 8-6" />
    </Icon>
  ),
  folder: (
    <Icon>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
    </Icon>
  ),
  check: (
    <Icon>
      <path d="M9 11.5 11.2 14 15.5 9" />
      <path d="M12 3 4.5 6v5.5c0 4.4 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5.1 7.5-9.5V6L12 3Z" />
    </Icon>
  ),
  building: (
    <Icon>
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21M15 10h3.5a1.5 1.5 0 0 1 1.5 1.5V21M3 21h18" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </Icon>
  ),
  person: (
    <Icon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </Icon>
  ),
  arrow: (
    <Icon>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  ),
};

const steps = [
  {
    title: "Conte o que você oferece",
    text: "Descreva em linguagem natural os produtos e serviços da empresa, escolha palavras-chave e marque os estados onde atua.",
  },
  {
    title: "A IA peneira os editais",
    text: "Todo dia coletamos as licitações abertas no PNCP e medimos a similaridade semântica entre cada edital e o seu perfil — não só palavras iguais, mas o sentido.",
  },
  {
    title: "Receba só o que importa",
    text: "Veja as oportunidades ordenadas por relevância, receba alertas por e-mail e prepare os documentos de cada edital em um só lugar.",
  },
];

const features = [
  {
    icon: icons.spark,
    title: "Busca semântica",
    text: "Embeddings comparam o objeto da licitação com a descrição do seu negócio. “Manutenção de ar-condicionado” encontra “climatização predial”.",
  },
  {
    icon: icons.map,
    title: "Vários estados de uma vez",
    text: "Escolha uma ou várias UFs de atuação. A coleta consulta os estados em paralelo e o painel mostra só o que está no seu território.",
  },
  {
    icon: icons.mail,
    title: "Alertas por e-mail",
    text: "Um único resumo diário com as novidades que combinam com você, sem repetir o que já foi enviado.",
  },
  {
    icon: icons.folder,
    title: "Documentos organizados",
    text: "Envie os PDFs pedidos em cada edital e acompanhe tudo na página da empresa, com validade e histórico de uso.",
  },
  {
    icon: icons.check,
    title: "Análise de requisitos",
    text: "Quando você pede, a IA compara seus documentos com os requisitos de habilitação e aponta o que atende, o que falta e o que revisar.",
  },
  {
    icon: icons.building,
    title: "Fonte oficial",
    text: "Os editais vêm do Portal Nacional de Contratações Públicas, com link direto para a publicação original de cada um.",
  },
];

const exampleResults = [
  { title: "Aquisição de notebooks e periféricos", place: "Recife, PE", score: 91 },
  { title: "Manutenção preventiva de climatização", place: "Olinda, PE", score: 84 },
  { title: "Licença de software de gestão", place: "João Pessoa, PB", score: 76 },
];

const faq = [
  {
    question: "De onde vêm os editais?",
    answer:
      "Do Portal Nacional de Contratações Públicas (PNCP), a fonte oficial das contratações regidas pela Lei 14.133/2021. Cada oportunidade tem link para a publicação original.",
  },
  {
    question: "O que significa o percentual em cada oportunidade?",
    answer:
      "É a similaridade semântica entre o edital e o perfil que você descreveu. Ajuda a priorizar a leitura, mas não representa chance de contratação nem de habilitação — confira sempre o edital.",
  },
  {
    question: "Posso acompanhar mais de um estado?",
    answer:
      "Sim. Marque quantas UFs quiser no perfil. Sem nenhuma marcada, você vê oportunidades de todos os estados coletados.",
  },
  {
    question: "Meus documentos ficam seguros?",
    answer:
      "Os PDFs ficam em armazenamento privado, acessível só pela sua conta. O conteúdo só é enviado para análise por IA quando você solicita.",
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ conta?: string }>;
}) {
  const { conta } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="shell lp-header-inner">
          <Link className="brand" href="/">
            <span className="brand-mark">p.</span>
            peneir.IA
          </Link>
          <nav aria-label="Seções da página" className="lp-nav">
            <a href="#como-funciona">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#para-quem">Para quem</a>
            <a href="#perguntas">Perguntas</a>
          </nav>
          <div className="lp-header-actions">
            {signedIn ? (
              <Link className="button button-small" href="/dashboard">
                Abrir meu painel
              </Link>
            ) : (
              <>
                <Link className="lp-link" href="/login">
                  Entrar
                </Link>
                <Link className="button button-small" href="/cadastro-empresa">
                  Começar agora
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {conta === "excluida" && (
          <p className="shell notice lp-account-deleted" role="status">
            Sua conta e seus dados foram excluídos. Obrigado por usar a peneir.IA.
          </p>
        )}
        <section className="shell lp-hero">
          <div className="lp-hero-copy">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Licitações públicas com inteligência artificial
            </span>
            <h1>
              Milhares de editais.
              <br />
              Só os <mark>certos</mark> para você.
            </h1>
            <p>
              Buscamos licitações do Portal Nacional de Contratações Públicas todos os dias,
              comparando cada edital com o que sua empresa oferece e avisamos só o que combina
              com o seu negócio.
            </p>
            <div className="lp-cta-row">
              {signedIn ? (
                <Link className="button lp-button-large" href="/dashboard">
                  Ver minhas oportunidades {icons.arrow}
                </Link>
              ) : (
                <>
                  <Link className="button lp-button-large" href="/cadastro-empresa">
                    Cadastrar minha empresa {icons.arrow}
                  </Link>
                  <Link
                    className="button button-secondary lp-button-large"
                    href="/login"
                  >
                    Já tenho conta
                  </Link>
                </>
              )}
            </div>
            <ul className="lp-hero-points">
              <li>Dados oficiais do PNCP</li>
              <li>Atualização diária</li>
              <li>Todas as 27 UFs</li>
            </ul>
          </div>

          <div aria-hidden="true" className="lp-sieve">
            <div className="lp-sieve-label">
              <span className="lp-live-dot" />
              Editais abertos no PNCP
            </div>
            <div className="lp-grains">
              {Array.from({ length: 20 }, (_, index) => (
                <span
                  className="lp-grain"
                  key={index}
                  style={{
                    left: `${4 + ((index * 41) % 90)}%`,
                    animationDelay: `${-((index * 0.16) % 3.2).toFixed(2)}s`,
                  }}
                />
              ))}
            </div>
            <svg className="lp-mesh" preserveAspectRatio="none" viewBox="0 0 400 72">
              <defs>
                <pattern
                  height="9"
                  id="lp-mesh-pattern"
                  patternTransform="rotate(45)"
                  patternUnits="userSpaceOnUse"
                  width="9"
                >
                  <path d="M0 4.5h9M4.5 0v9" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.2" />
                </pattern>
              </defs>
              <path
                d="M10 10 Q200 58 390 10 L390 28 Q200 76 10 28 Z"
                fill="url(#lp-mesh-pattern)"
              />
              <path d="M10 10 Q200 58 390 10" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M10 28 Q200 76 390 28" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10v18M390 10v18" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
            </svg>
            <div className="lp-results">
              <div className="lp-results-head">
                <span>Para você</span>
                <span className="lp-results-tag">exemplo ilustrativo</span>
              </div>
              {exampleResults.map((result, index) => (
                <div
                  className="lp-result"
                  key={result.title}
                  style={{ animationDelay: `${0.25 + index * 0.18}s` }}
                >
                  <div>
                    <strong>{result.title}</strong>
                    <span>{result.place}</span>
                  </div>
                  <span
                    className={`lp-score${result.score >= 80 ? " lp-score-great" : ""}`}
                  >
                    {result.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="shell lp-strip" aria-label="Destaques">
          <div>
            <strong>PNCP</strong>
            <span>fonte oficial das contratações públicas</span>
          </div>
          <div>
            <strong>Lei 14.133</strong>
            <span>requisitos extraídos do edital</span>
          </div>
          <div>
            <strong>27 UFs</strong>
            <span>escolha um ou vários estados</span>
          </div>
          <div>
            <strong>Diário</strong>
            <span>coleta, indexação e alertas</span>
          </div>
        </section>

        <section className="shell lp-section" id="como-funciona">
          <div className="lp-section-head">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Como funciona
            </span>
            <h2>Do cadastro ao edital certo em três passos.</h2>
          </div>
          <ol className="lp-steps">
            {steps.map((step, index) => (
              <li className="lp-step" key={step.title}>
                <span className="lp-step-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="shell lp-section" id="recursos">
          <div className="lp-section-head">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Recursos
            </span>
            <h2>Tudo o que você precisa para não perder o prazo.</h2>
          </div>
          <div className="lp-features">
            {features.map((feature) => (
              <article className="lp-feature" key={feature.title}>
                <span className="lp-feature-icon">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shell lp-section lp-score-section">
          <div className="lp-score-copy">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Transparência
            </span>
            <h2>Um score que explica, não que promete.</h2>
            <p>
              Cada oportunidade mostra o quanto o edital se parece com o perfil
              que você descreveu. Acima de 80%, destacamos como{" "}
              <strong>ótima match</strong>. É uma ferramenta para priorizar a
              leitura — a decisão de participar continua sendo sua, com o edital
              oficial em mãos.
            </p>
          </div>
          <div aria-hidden="true" className="lp-meter-card">
            {[
              { label: "Climatização predial", value: 88 },
              { label: "Material de escritório", value: 61 },
              { label: "Obras de pavimentação", value: 23 },
            ].map((item) => (
              <div className="lp-meter" key={item.label}>
                <div className="lp-meter-label">
                  <span>{item.label}</span>
                  <strong>{item.value}%</strong>
                </div>
                <div className="lp-meter-track">
                  <span
                    className={item.value >= 80 ? "lp-meter-great" : undefined}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="lp-meter-note">
              Exemplo para uma empresa de manutenção de ar-condicionado.
            </p>
          </div>
        </section>

        <section className="shell lp-section" id="para-quem">
          <div className="lp-section-head">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Para quem
            </span>
            <h2>Feito para quem vende para o governo — e para quem quer crescer.</h2>
          </div>
          <div className="lp-audiences">
            <article className="lp-audience lp-audience-primary">
              <span className="lp-feature-icon">{icons.building}</span>
              <h3>Empresas fornecedoras</h3>
              <p>
                Micro, pequenas e médias empresas que querem encontrar
                licitações compatíveis sem passar horas em portais, e manter a
                documentação de habilitação em dia.
              </p>
              <Link className="button" href={signedIn ? "/dashboard" : "/cadastro-empresa"}>
                {signedIn ? "Abrir meu painel" : "Cadastrar empresa"}
              </Link>
            </article>
            <article className="lp-audience">
              <span className="lp-feature-icon">{icons.person}</span>
              <h3>
                Pessoas <span className="lp-soon">em breve</span>
              </h3>
              <p>
                Concursos, seleções de doutorado e bolsas de pesquisa no mesmo
                radar. Já é possível criar sua conta e montar seu perfil
                enquanto conectamos essas fontes.
              </p>
              <Link
                className="button button-secondary"
                href={signedIn ? "/dashboard" : "/login?modo=cadastro"}
              >
                {signedIn ? "Abrir meu painel" : "Criar conta pessoal"}
              </Link>
            </article>
          </div>
        </section>

        <section className="shell lp-section" id="perguntas">
          <div className="lp-section-head">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              Perguntas frequentes
            </span>
            <h2>Antes de começar.</h2>
          </div>
          <div className="lp-faq">
            {faq.map((item) => (
              <details className="lp-faq-item" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="shell lp-final">
          <div>
            <h2>Sua próxima venda pode estar em um edital publicado hoje.</h2>
            <p>Crie sua conta, descreva o que você oferece e deixe a peneira trabalhar.</p>
          </div>
          <Link
            className="button lp-button-large lp-button-lime"
            href={signedIn ? "/dashboard" : "/cadastro-empresa"}
          >
            {signedIn ? "Ver minhas oportunidades" : "Começar agora"} {icons.arrow}
          </Link>
        </section>
      </main>

      <footer className="shell lp-footer">
        <Link className="brand" href="/">
          <span className="brand-mark">p.</span>
          peneir.IA
        </Link>
        <p>
          Licitações coletadas do Portal Nacional de Contratações Públicas
          (PNCP). Confirme sempre requisitos e prazos no edital original. A
          análise automatizada é apoio e não substitui a conferência humana.
          <br />
          <Link href="/privacidade">Política de Privacidade</Link> ·{" "}
          <Link href="/termos">Termos de Uso</Link>
        </p>
      </footer>
    </div>
  );
}

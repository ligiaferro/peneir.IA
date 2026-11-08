"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import {
  editalFieldLabels,
  type EditalFieldKey,
  type EditalFileStatus,
  type OpportunityEdital,
} from "@/lib/edital-insights";

const pollIntervalMs = 4_000;
/** Para de acompanhar depois disso; a leitura continua no servidor. */
const maxPollMs = 6 * 60_000;

const progressMessages = [
  "Buscando os arquivos do edital no PNCP…",
  "Baixando e abrindo os PDFs (inclusive dentro de ZIP)…",
  "Lendo o texto do edital…",
  "Identificando documentos exigidos e condições de participação…",
];

const fileStatusLabels: Record<EditalFileStatus, string> = {
  lido: "lido",
  sem_texto: "sem texto (digitalizado)",
  nao_suportado: "formato não suportado",
  muito_grande: "grande demais",
  erro: "não foi possível ler",
};

type EditalResponse = { edital?: OpportunityEdital | null; error?: string };

export function EditalPanel({
  opportunityId,
  initialEdital,
}: {
  opportunityId: string;
  initialEdital: OpportunityEdital | null;
}) {
  const router = useRouter();
  const [edital, setEdital] = useState(initialEdital);
  const [requestError, setRequestError] = useState("");
  const [working, setWorking] = useState(initialEdital?.status === "processing");
  const [messageIndex, setMessageIndex] = useState(0);
  const started = useRef(false);

  const finish = useCallback(
    (next: OpportunityEdital | null) => {
      setEdital(next);
      setWorking(false);
      // Recarrega os dados do servidor: os requisitos da página vêm do edital.
      if (next?.status === "ready") router.refresh();
    },
    [router],
  );

  const poll = useCallback(async () => {
    const deadline = Date.now() + maxPollMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      try {
        const response = await fetch(`/api/edital?id=${encodeURIComponent(opportunityId)}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as EditalResponse;
        if (body.edital && body.edital.status !== "processing") {
          finish(body.edital);
          return;
        }
      } catch {
        // Tenta de novo no próximo ciclo.
      }
    }
    setWorking(false);
    setRequestError("A leitura está demorando mais que o normal. Recarregue a página em instantes.");
  }, [finish, opportunityId]);

  const start = useCallback(async (force = false) => {
    setWorking(true);
    setRequestError("");
    setMessageIndex(0);
    try {
      const response = await fetch("/api/edital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, force }),
      });
      const body = (await response.json()) as EditalResponse;
      if (!response.ok && response.status !== 202) {
        setWorking(false);
        setRequestError(body.error ?? "Não foi possível ler o edital agora.");
        return;
      }
      if (body.edital && body.edital.status !== "processing") {
        finish(body.edital);
      } else {
        await poll();
      }
    } catch {
      setWorking(false);
      setRequestError("Falha de conexão ao ler o edital. Tente novamente.");
    }
  }, [finish, opportunityId, poll]);

  /** Verifica, sem bloquear a tela, se o PNCP publicou arquivos novos. */
  const checkForUpdates = useCallback(async () => {
    try {
      const response = await fetch("/api/edital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, check: true }),
      });
      const body = (await response.json()) as EditalResponse;
      if (body.edital?.status === "processing") {
        setEdital(body.edital);
        setWorking(true);
        await poll();
      }
    } catch {
      // A verificação é opcional; a leitura atual continua válida.
    }
  }, [opportunityId, poll]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialEdital?.status === "processing") void poll();
    else if (initialEdital?.status === "ready" || initialEdital?.status === "no_text") {
      void checkForUpdates();
    }
  }, [checkForUpdates, initialEdital?.status, poll]);

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(
      () => setMessageIndex((index) => Math.min(index + 1, progressMessages.length - 1)),
      9_000,
    );
    return () => clearInterval(timer);
  }, [working]);

  const insights = edital?.status === "ready" ? edital.insights : null;
  const fields = insights
    ? (Object.keys(editalFieldLabels) as EditalFieldKey[]).filter((key) => insights.campos[key])
    : [];

  return (
    <section className="section edital-panel" aria-live="polite">
      <div className="edital-panel-head">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-dot" />
            Leitura do edital
          </span>
          <h2>O que o edital diz</h2>
        </div>
        {edital?.status === "ready" && edital.processedAt && (
          <span className="badge">Lido por IA em {formatDate(edital.processedAt)}</span>
        )}
        {edital?.status === "ready" && !working && (
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => void start(true)}
          >
            Refazer leitura
          </button>
        )}
      </div>

      {working && (
        <div className="edital-progress">
          <span className="edital-spinner" aria-hidden="true" />
          <div>
            <strong>
              {edital?.insights
                ? "O PNCP publicou arquivos novos deste edital (retificação ou anexos). Relendo…"
                : progressMessages[messageIndex]}
            </strong>
            <p>
              Na primeira vez, a leitura pode levar até um minuto. Depois, ela
              fica salva para esta oportunidade.
            </p>
          </div>
        </div>
      )}

      {!working && requestError && (
        <div className="edital-message">
          <p className="notice notice-error">{requestError}</p>
          <button className="button button-small" type="button" onClick={() => void start(edital?.status === "ready")}>
            Tentar novamente
          </button>
        </div>
      )}

      {!working && !requestError && edital?.status === "failed" && (
        <div className="edital-message">
          <p className="notice notice-error">
            Não foi possível ler o edital desta vez. Tente novamente ou confira
            os arquivos na fonte oficial.
          </p>
          <button className="button button-small" type="button" onClick={() => void start()}>
            Tentar novamente
          </button>
        </div>
      )}

      {!working && !requestError && edital?.status === "no_files" && (
        <div className="edital-message">
          <p className="notice">
            O PNCP ainda não tem arquivos publicados para esta contratação. Use o
            link da fonte oficial para conferir.
          </p>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => void start()}
          >
            Verificar de novo
          </button>
        </div>
      )}

      {!working && !requestError && edital?.status === "no_text" && (
        <div className="edital-message">
          <p className="notice">
            Os arquivos do edital não têm texto selecionável (provavelmente foram
            digitalizados como imagem ou estão em formato não suportado, como RAR).
            Consulte o edital na fonte oficial.
          </p>
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => void start()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!working && !requestError && edital === null && (
        <div className="edital-message">
          <p className="notice">
            A leitura não começou. Inicie quando quiser para extrair os requisitos
            e condições do edital.
          </p>
          <button className="button button-small" type="button" onClick={() => void start()}>
            Ler edital com IA
          </button>
        </div>
      )}

      {!working && insights && (
        <>
          <p className="edital-summary">{insights.resumo}</p>
          {fields.length > 0 && (
            <dl className="edital-fields">
              {fields.map((key) => (
                <div className="edital-field" key={key}>
                  <dt>{editalFieldLabels[key]}</dt>
                  <dd>{insights.campos[key]}</dd>
                </div>
              ))}
            </dl>
          )}
          {insights.alertas.length > 0 && (
            <div className="edital-alerts">
              <strong>Pontos de atenção</strong>
              <ul>
                {insights.alertas.map((alerta, index) => (
                  <li key={`${index}-${alerta}`}>{alerta}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!working && edital && edital.files.length > 0 && (
        <div className="edital-files">
          <span>Arquivos considerados:</span>
          {edital.files.map((file) => (
            <a
              className={`edital-file edital-file-${file.status}`}
              href={file.url}
              key={file.url}
              rel="noreferrer"
              target="_blank"
              title={file.nome}
            >
              {file.tipo || file.titulo}
              {file.paginas ? ` · ${file.paginas} p.` : ""} · {fileStatusLabels[file.status]} ↗
            </a>
          ))}
        </div>
      )}

      {!working && insights && (
        <p className="fine-print">
          Resumo e requisitos gerados por IA a partir do texto do edital. Podem
          conter erros ou omissões: confira sempre o edital oficial e seus anexos.
        </p>
      )}
    </section>
  );
}

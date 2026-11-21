import { useEffect, useState } from "react";
import { ActiveCheck } from "../../components/ActiveCheck";
import { fill } from "../../lib/i18n";

interface StageCopy {
  title: string;
  detail: string;
}

const STEP_MS = 7000;

/** Поэтапный поиск, пока один запрос агента ещё не вернулся. На последнем шаге остаётся до ответа. */
export function ResearchProgress({
  stages,
  stageOf,
  caption,
}: {
  stages: readonly StageCopy[];
  stageOf: string;
  caption: string;
}) {
  const [index, setIndex] = useState(0);
  const last = Math.max(stages.length - 1, 0);

  useEffect(() => {
    if (index >= last) return;
    const timer = window.setTimeout(() => setIndex((current) => Math.min(current + 1, last)), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [index, last]);

  const current = stages[index];
  if (!current) return null;

  return (
    <section className="research mt-4 rounded-lg border border-border p-4" aria-live="polite">
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {fill(stageOf, { current: index + 1, total: stages.length })}
      </p>
      <ol className="mt-3 space-y-2">
        {stages.map((stage, i) => {
          const state = i < index ? "done" : i === index ? "active" : "wait";
          return (
            <li key={stage.title} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" aria-hidden>
                {state === "done" ? <ActiveCheck /> : <span className={state === "active" ? "research-dot research-dot-active" : "research-dot"} />}
              </span>
              <span className={state === "wait" ? "text-muted-foreground" : "font-medium"}>{stage.title}</span>
            </li>
          );
        })}
      </ol>
      <div key={index} className="research-scene fade-up mt-4" data-scene={index}>
        <Scene kind={index} />
        <p className="mt-3 text-sm text-muted-foreground">{current.detail}</p>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{caption}</p>
    </section>
  );
}

function Scene({ kind }: { kind: number }) {
  if (kind === 0) {
    return (
      <div className="research-feed" aria-hidden>
        <div className="research-feed-track">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="research-post">
              <i /><i /><i />
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 1) {
    return (
      <div className="research-search" aria-hidden>
        <span /><span /><span /><span />
        <i className="research-scan" />
      </div>
    );
  }
  if (kind === 2) {
    return (
      <div className="research-bars" aria-hidden>
        <i /><i /><i /><i />
      </div>
    );
  }
  if (kind === 3) {
    return (
      <div className="research-drafts" aria-hidden>
        <span><i /><i /><i /></span>
        <span><i /><i /><i /></span>
        <span><i /><i /><i /></span>
      </div>
    );
  }
  return (
    <div className="research-slots" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <i key={i} className={i === 4 ? "research-slot-hot" : undefined} />
      ))}
    </div>
  );
}

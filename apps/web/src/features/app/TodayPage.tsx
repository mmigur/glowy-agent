import { answeredCount } from "@growth/core";
import { Circle } from "lucide-react";
import { ActiveCheck } from "../../components/ActiveCheck";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { PageHeader } from "./PageHeader";
import { ThreadCard } from "./ThreadCard";
import { appCopy, tError } from "../../lib/app-copy";
import { fill, useI18n } from "../../lib/i18n";
import { useThreads } from "./useThreads";
import { useSocialAccounts } from "./useSocialAccounts";
import { useStrategy } from "./useStrategy";

interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  /** Пока данные грузятся, статус неизвестен и мы его не показываем. */
  checking: boolean;
  action?: { to: string; label: string };
  note?: string;
}

export function TodayPage() {
  const { locale } = useI18n();
  const copy = appCopy[locale].today;
  const { state: accounts } = useSocialAccounts();
  const { state: strategy } = useStrategy();
  const { threads, usage, runThread, scheduleDraft } = useThreads();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const hasAccount = accounts.status === "ready" && accounts.accounts.some((a) => a.status === "active");
  const onboardingDone = strategy.status === "ready" && strategy.completed;
  const startedOnboarding = strategy.status === "ready" && answeredCount(strategy.answers) > 0;

  const steps: SetupStep[] = [
    { key: "account", label: copy.steps.account, done: true, checking: false },
    {
      key: "connect",
      label: copy.steps.connect,
      done: hasAccount,
      checking: accounts.status === "loading",
      action: { to: "/app/settings", label: copy.connect },
    },
    {
      key: "onboarding",
      label: copy.steps.onboarding,
      done: onboardingDone,
      checking: strategy.status === "loading",
      action: { to: "/app/onboarding", label: startedOnboarding ? copy.continue : copy.start },
    },
    {
      key: "research",
      label: copy.steps.research,
      done: (threads.data?.length ?? 0) > 0,
      checking: threads.loading,
    },
  ];

  const ready = hasAccount && onboardingDone;
  const left = usage.data ? Math.max(usage.data.limit - usage.data.used, 0) : null;
  const limitReached = left === 0;

  async function start() {
    setRunning(true);
    setRunError(null);
    const message = await runThread();
    setRunning(false);
    if (message) setRunError(message);
  }

  const nextStep = steps.find((s) => !s.done && !s.checking && s.action);

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />

      <div className="flex flex-wrap items-center gap-3">
        <Button size="md" disabled={!ready || running || limitReached} onClick={start}>
          {running ? copy.researching : copy.newThread}
        </Button>
        {usage.data ? (
          <span className="text-sm text-muted-foreground">
            {fill(copy.used, { used: usage.data.used, limit: usage.data.limit })}
            {limitReached ? ` ${fill(copy.resets, { time: new Date(usage.data.resetsAt).toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" }) })}` : ""}
          </span>
        ) : null}
      </div>
      {running ? <p className="mt-3 text-sm text-muted-foreground">{copy.running}</p> : null}
      {runError ? <p role="alert" className="mt-3 text-sm">{tError(runError, locale)}</p> : null}

      <div className="mt-6 space-y-5">
        {(threads.data ?? []).length > 0 ? (
          threads.data!.map((t) => <ThreadCard key={t.id} thread={t} onSchedule={scheduleDraft} />)
        ) : (
          <EmptyState
            title={copy.emptyTitle}
            description={copy.emptyBody}
          >
            {!ready && nextStep?.action ? (
              <Link to={nextStep.action.to} className={buttonVariants({ size: "sm" })}>
                {nextStep.label}
              </Link>
            ) : null}
          </EmptyState>
        )}
      </div>

      <section className="mt-10" aria-labelledby="setup-heading">
        <h2 id="setup-heading" className="text-sm font-medium">
          {copy.setup}
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-3 px-4 py-3 text-sm">
              {step.done ? (
                <ActiveCheck label={appCopy[locale].done} />
              ) : (
                <Circle className="size-4 text-muted-foreground" aria-label={appCopy[locale].notDone} />
              )}
              <span className={step.done ? "" : "text-muted-foreground"}>{step.label}</span>
              <span className="ml-auto flex items-center gap-2">
                {step.note ? <Badge tone="muted">{step.note}</Badge> : null}
                {step.checking ? <Badge tone="muted">{appCopy[locale].checking}</Badge> : null}
                {!step.done && !step.checking && step.action ? (
                  <Link to={step.action.to} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {step.action.label}
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

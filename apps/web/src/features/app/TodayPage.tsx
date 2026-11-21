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
import { CoachMark } from "./CoachMark";
import { ResearchProgress } from "./ResearchProgress";
import { ThreadCard } from "./ThreadCard";
import { appCopy, tError } from "../../lib/app-copy";
import { fill, useI18n, type Locale } from "../../lib/i18n";
import { useThreads } from "./useThreads";
import { useSocialAccounts } from "./useSocialAccounts";
import { useStrategy } from "./useStrategy";

/** Полночь следующего дня в часовом поясе браузера: «22 ноября» и «00:00». */
function formatReset(iso: string, locale: Locale): { date: string; time: string } {
  const when = new Date(iso);
  const tag = locale === "ru" ? "ru-RU" : "en-US";
  const parts = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(when);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return {
    date: when.toLocaleDateString(tag, { day: "numeric", month: "long" }),
    time: `${hour === "24" ? "00" : hour}:${minute}`,
  };
}

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
  const { threads, usage, runThread, scheduleDraft, setDraftImage, discardThread } = useThreads();
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

  const hasScheduled = (threads.data ?? []).some((thread) => (thread.drafts ?? []).some((draft) => draft.status === "scheduled" || draft.status === "published"));
  const tour = hasScheduled ? null : !hasAccount ? "connect" : running ? "writing" : (threads.data?.length ?? 0) === 0 ? "new-thread" : "schedule";
  const tourCopy = appCopy[locale].tour;
  const ready = hasAccount && onboardingDone;
  const left = usage.data ? Math.max(usage.data.limit - usage.data.used, 0) : null;
  const limitReached = left === 0;
  const visibleThreads = (threads.data ?? []).filter((thread) =>
    (thread.drafts ?? []).some((draft) => draft.status === "suggested" || draft.status === "scheduled" || draft.status === "published"),
  );

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
        <Button size="md" data-tour="new-thread" disabled={!ready || running || limitReached} onClick={start}>
          {running ? copy.researching : copy.newThread}
        </Button>
        {usage.data ? (
          <span className="text-sm text-muted-foreground">
            {fill(copy.used, { used: usage.data.used, limit: usage.data.limit })}
            {limitReached ? ` ${fill(copy.resets, formatReset(usage.data.resetsAt, locale))}` : ""}
          </span>
        ) : null}
      </div>
      {running ? <ResearchProgress stages={copy.stages} stageOf={copy.stageOf} caption={copy.running} /> : null}
      {runError ? <p role="alert" className="mt-3 text-sm">{tError(runError, locale)}</p> : null}

      <div className="mt-6 space-y-5">
        {visibleThreads.length > 0 ? (
          visibleThreads.map((t, index) => (
            <ThreadCard
              key={t.id}
              thread={t}
              onSchedule={scheduleDraft}
              onImage={setDraftImage}
              onDiscard={discardThread}
              onRegenerate={start}
              regenerateDisabled={!ready || running || limitReached}
              tourSchedule={tour === "schedule" && index === visibleThreads.findIndex((item) => (item.drafts ?? []).some((draft) => draft.status === "suggested"))}
            />
          ))
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
                  <Link to={step.action.to} data-tour={step.key === "connect" ? "connect" : undefined} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {step.action.label}
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {tour === "connect" ? <CoachMark key={`connect-${accounts.status}`} target="connect" title={tourCopy.connectTitle} body={tourCopy.connectBody} /> : null}
      {tour === "new-thread" ? <CoachMark key="new-thread" target="new-thread" title={tourCopy.threadTitle} body={tourCopy.threadBody} /> : null}
      {tour === "writing" ? <CoachMark key="writing" target="new-thread" title={tourCopy.writingTitle} body={tourCopy.writingBody} /> : null}
      {tour === "schedule" ? <CoachMark key={`schedule-${threads.data?.[0]?.id ?? "none"}`} target="schedule" title={tourCopy.scheduleTitle} body={tourCopy.scheduleBody} /> : null}
    </>
  );
}

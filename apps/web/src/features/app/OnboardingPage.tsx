import { ONBOARDING_QUESTIONS, emptyAnswers, sanitizeAnswers, toggleAnswer, type OnboardingAnswers } from "@growth/core";
import { ActiveCheck } from "../../components/ActiveCheck";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { Logo } from "../../components/Logo";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Button } from "../../components/ui/button";
import { appCopy, tError } from "../../lib/app-copy";
import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { useStrategy } from "./useStrategy";

export function OnboardingPage() {
  const { locale } = useI18n();
  const ui = appCopy[locale];
  const copy = ui.onboard;
  const navigate = useNavigate();
  const { state, save } = useStrategy();
  const [answers, setAnswers] = useState<OnboardingAnswers>(emptyAnswers);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialised = useRef(false);

  // Один раз подставляем уже сохранённые ответы (повторное открытие или редактирование).
  useEffect(() => {
    if (state.status === "ready" && !initialised.current) {
      initialised.current = true;
      setAnswers(sanitizeAnswers(state.answers));
    }
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground" role="status">
        {copy.loading}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="text-center">
          <p role="alert" className="text-sm text-danger">
            {tError(state.message, locale)}
          </p>
          <Link to="/app" className="mt-3 inline-block text-sm underline underline-offset-4">
            {copy.backToApp}
          </Link>
        </div>
      </div>
    );
  }

  const total = ONBOARDING_QUESTIONS.length;
  const question = ONBOARDING_QUESTIONS[step];
  if (!question) return null;
  const selected = answers[question.id] ?? [];
  const isLast = step === total - 1;
  const editing = state.completed;

  async function advance(next: OnboardingAnswers) {
    setSaving(true);
    setError(null);
    // Каждый шаг сохраняется сразу: если закрыть вкладку, прогресс не потеряется.
    const message = await save(next, { complete: isLast });
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    if (isLast) navigate("/app", { replace: true });
    else setStep((s) => s + 1);
  }

  function choose(optionId: string) {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: toggleAnswer(question, prev[question.id], optionId) }));
  }

  function skip() {
    if (!question) return;
    void advance({ ...answers, [question.id]: [] });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <ThemeToggle />
          <Link
            to={editing ? "/app" : "/"}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copy.exit}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-label={copy.progress}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step + 1}
        >
          {ONBOARDING_QUESTIONS.map((q, i) => (
            <span key={q.id} className={cn("h-0.5 flex-1 rounded-full", i <= step ? "bg-foreground" : "bg-border")} />
          ))}
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          {step + 1} / {total}
          {editing ? ` · ${copy.editing}` : ""}
        </p>

        <div key={question.id} className="fade-up">
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">{ui.questions[question.id].title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{ui.questions[question.id].hint}</p>

          <div
            role={question.kind === "single" ? "radiogroup" : "group"}
            aria-label={ui.questions[question.id].title}
            className="mt-8 grid gap-2"
          >
            {question.options.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role={question.kind === "single" ? "radio" : "checkbox"}
                  aria-checked={checked}
                  onClick={() => choose(option.id)}
                  className={cn(
                    "flex h-11 items-center justify-between rounded-md border px-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    checked
                      ? "border-foreground bg-muted font-medium"
                      : "border-border-strong hover:border-foreground/60 hover:bg-muted",
                  )}
                >
                  {(ui.questions[question.id].options as Record<string, string>)[option.id] ?? option.label}
                  {checked ? <ActiveCheck /> : null}
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {tError(error, locale)}
          </p>
        ) : null}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
            {copy.back}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={skip} disabled={saving}>
              {copy.skip}
            </Button>
            <Button onClick={() => void advance(answers)} disabled={saving || selected.length === 0}>
              {saving ? copy.saving : isLast ? (editing ? copy.save : copy.finish) : copy.continue}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

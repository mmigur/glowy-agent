import { ONBOARDING_QUESTIONS } from "@growth/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import { PRICING } from "../../lib/brand";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { appCopy, tError } from "../../lib/app-copy";
import { fill, useI18n } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { cn } from "../../lib/utils";
import { useAuth } from "../auth/AuthProvider";
import { ConnectionsSection } from "./ConnectionsSection";
import { PageHeader } from "./PageHeader";
import { useStrategy } from "./useStrategy";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-b border-border py-8 first:pt-0 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { session } = useAuth();
  const { theme, setTheme } = useTheme();
  const { state: strategy } = useStrategy();
  const { locale, m } = useI18n();
  const copy = m.settings;
  const ui = appCopy[locale];

  return (
    <>
      <PageHeader title={copy.title} />

      <Section title={copy.account}>
        <p className="text-sm">{session?.user.email}</p>
      </Section>

      <Section title={copy.appearance}>
        <div role="radiogroup" aria-label={copy.theme} className="inline-flex rounded-md border border-border-strong p-0.5">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={cn(
                "h-8 rounded px-4 text-sm transition-colors",
                theme === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "light" ? copy.light : copy.dark}
            </button>
          ))}
        </div>
      </Section>

      <Section title={copy.language} description={copy.languageHint}>
        <LanguageSwitch variant="full" />
      </Section>

      <Section title={copy.strategy} description={copy.strategyHint}>
        {strategy.status === "loading" ? (
          <p className="text-sm text-muted-foreground" role="status">
            {copy.loading}
          </p>
        ) : strategy.status === "error" ? (
          <p role="alert" className="text-sm text-danger">
            {tError(strategy.message, locale)}
          </p>
        ) : (
          <div>
            <dl className="divide-y divide-border rounded-lg border border-border">
              {ONBOARDING_QUESTIONS.map((q) => (
                <div key={q.id} className="grid grid-cols-[150px_1fr] gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{ui.questions[q.id].title.replace(/\?$/, "")}</dt>
                  <dd className={(strategy.answers[q.id]?.length ?? 0) === 0 ? "text-muted-foreground" : ""}>
                    {(strategy.answers[q.id]?.length ?? 0) === 0
                      ? ui.onboard.skipped
                      : strategy.answers[q.id].map((id) => (ui.questions[q.id].options as Record<string, string>)[id] ?? id).join(", ")}
                  </dd>
                </div>
              ))}
            </dl>
            <Link to="/app/onboarding" className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-3"}>
              {strategy.completed ? copy.editAnswers : copy.answerQuestions}
            </Link>
          </div>
        )}
      </Section>

      <Section title={copy.connections} description={copy.connectionsHint}>
        <ConnectionsSection />
      </Section>

      <Section title={copy.subscription}>
        <div className="rounded-lg border border-border px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Pro</p>
            <Badge tone="muted">{copy.billing}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {fill(copy.price, { price: PRICING.proPriceUsd, days: PRICING.trialDays })}
          </p>
        </div>
      </Section>
    </>
  );
}

import { ONBOARDING_QUESTIONS, summarizeAnswer } from "@growth/core";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/button";
import { PRICING } from "../../lib/brand";
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

  return (
    <>
      <PageHeader title="Settings" />

      <Section title="Account">
        <p className="text-sm">{session?.user.email}</p>
      </Section>

      <Section title="Appearance">
        <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-md border border-border-strong p-0.5">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={cn(
                "h-8 rounded px-4 text-sm capitalize transition-colors",
                theme === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Content strategy" description="Answers from the setup questions. The agent uses them to choose topics and tone.">
        {strategy.status === "loading" ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        ) : strategy.status === "error" ? (
          <p role="alert" className="text-sm text-danger">
            {strategy.message}
          </p>
        ) : (
          <div>
            <dl className="divide-y divide-border rounded-lg border border-border">
              {ONBOARDING_QUESTIONS.map((q) => (
                <div key={q.id} className="grid grid-cols-[150px_1fr] gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{q.title.replace(/\?$/, "")}</dt>
                  <dd className={strategy.answers[q.id].length === 0 ? "text-muted-foreground" : ""}>
                    {summarizeAnswer(q.id, strategy.answers)}
                  </dd>
                </div>
              ))}
            </dl>
            <Link to="/app/onboarding" className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-3"}>
              {strategy.completed ? "Edit answers" : "Answer the questions"}
            </Link>
          </div>
        )}
      </Section>

      <Section title="Connections" description="Accounts the agent publishes to. Connecting uses the official authorization flow.">
        <ConnectionsSection />
      </Section>

      <Section title="Subscription">
        <div className="rounded-lg border border-border px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Pro</p>
            <Badge tone="muted">Billing not connected</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            ${PRICING.proPriceUsd}/month after a {PRICING.trialDays}-day free trial.
          </p>
        </div>
      </Section>
    </>
  );
}

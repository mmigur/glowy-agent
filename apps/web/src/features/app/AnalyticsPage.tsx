import { useState } from "react";
import { Link } from "react-router-dom";
import { buttonVariants } from "../../components/ui/button";
import { appCopy, tError } from "../../lib/app-copy";
import { useI18n, type Locale } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { useInsights, type InsightPoint } from "./useInsights";
import { useSocialAccounts } from "./useSocialAccounts";

const PERIODS = [7, 14, 30, 90] as const;

function delta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function formatCount(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "ru" ? "ru-RU" : "en-US");
}

export function AnalyticsPage() {
  const { locale } = useI18n();
  const copy = appCopy[locale].analytics;
  const { state: accounts } = useSocialAccounts();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const connected = accounts.status === "ready" && accounts.accounts.some((account) => account.platform === "threads" && account.status === "active");
  const report = useInsights(connected ? days : 0);
  const data = connected ? report.data : undefined;

  return (
    <article id="insights-report">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{copy.title}</h1>
        <div className="no-print flex flex-wrap items-center gap-2" role="group" aria-label={copy.period}>
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={days === period}
              onClick={() => setDays(period)}
              className={cn(
                "h-7 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                days === period ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted-foreground hover:text-foreground",
              )}
            >
              {copy.periods[String(period) as keyof typeof copy.periods]}
            </button>
          ))}
          <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })} onClick={() => window.print()}>
            {copy.exportPdf}
          </button>
        </div>
        <p className="hidden print:block text-sm text-muted-foreground">{copy.periods[String(days) as keyof typeof copy.periods]}</p>
      </header>

      {accounts.status === "loading" || (connected && !data && !report.error) ? (
        <p className="text-sm text-muted-foreground" role="status">{copy.loading}</p>
      ) : null}
      {!connected && accounts.status !== "loading" ? (
        <p className="text-sm">
          {copy.connect}{" "}
          <Link to="/app/settings" className="underline underline-offset-4">{copy.connectAction}</Link>
        </p>
      ) : null}
      {report.error && connected ? <p role="alert" className="text-sm">{tError(report.error, locale)}</p> : null}

      {data ? <Report data={data} locale={locale} /> : null}
    </article>
  );
}

function Report({
  data,
  locale,
}: {
  data: NonNullable<ReturnType<typeof useInsights>["data"]>;
  locale: Locale;
}) {
  const copy = appCopy[locale].analytics;
  const viewDelta = delta(data.views.total, data.views.previous);
  const interactionDelta = delta(data.interactions.total, data.interactions.previous);

  return (
    <>
      <section aria-labelledby="insights-summary">
        <h2 id="insights-summary" className="text-sm font-medium">{copy.summary}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card label={copy.views} hint={copy.viewsHint} value={formatCount(data.views.total, locale)} change={viewDelta} note={copy.vsPrevious} />
          <Card label={copy.interactions} hint={copy.interactionsHint} value={formatCount(data.interactions.total, locale)} change={interactionDelta} note={copy.vsPrevious} />
          <Card label={copy.followers} hint={copy.followersHint} value={data.followers === null ? "—" : formatCount(data.followers, locale)} change={null} note="" />
          <Card label={copy.clicks} hint="" value={data.clicks === null ? "—" : formatCount(data.clicks, locale)} change={null} note="" />
        </div>
      </section>

      <section className="mt-8" aria-label={copy.chart}>
        <ViewsChart points={data.views.series} locale={locale} />
      </section>
    </>
  );
}

function Card({ label, hint, value, change, note }: { label: string; hint: string; value: string; change: number | null; note: string }) {
  const up = change !== null && change >= 0;
  return (
    <div className="rounded-xl bg-muted p-4">
      <p className="text-sm text-muted-foreground" title={hint}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {change !== null ? (
        <p className={cn("mt-1 text-sm", up ? "text-[#16a34a]" : "text-foreground")}>
          {up ? "+" : ""}{change}% <span className="text-muted-foreground">{note}</span>
        </p>
      ) : null}
    </div>
  );
}

function ViewsChart({ points, locale }: { points: InsightPoint[]; locale: Locale }) {
  const width = 640;
  const height = 180;
  const pad = 8;
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => {
    const x = pad + index * step;
    const y = height - pad - (point.value / max) * (height - pad * 2);
    return `${x},${y}`;
  });
  const line = coords.join(" ");
  const area = points.length > 0 ? `${pad},${height - pad} ${line} ${pad + (points.length - 1) * step},${height - pad}` : "";
  const tag = locale === "ru" ? "ru-RU" : "en-US";
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full" role="img">
        <polygon points={area} fill="currentColor" opacity="0.12" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{first ? new Date(first.end).toLocaleDateString(tag, { day: "numeric", month: "short" }) : ""}</span>
        <span>{last ? new Date(last.end).toLocaleDateString(tag, { day: "numeric", month: "short" }) : ""}</span>
      </div>
    </div>
  );
}

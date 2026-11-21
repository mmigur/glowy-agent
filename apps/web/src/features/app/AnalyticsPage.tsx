import { CAPABILITIES, PLATFORMS, type Availability, type MetricKey } from "@growth/core";
import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { appCopy } from "../../lib/app-copy";
import { useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { PageHeader } from "./PageHeader";

const PERIODS = ["7d", "30d", "3m", "6m", "1y"] as const;

const AVAILABILITY_TONE: Record<Availability, "solid" | "outline" | "muted"> = {
  available: "solid",
  conditional: "outline",
  unavailable: "muted",
  unverified: "muted",
};

const METRIC_ORDER: MetricKey[] = [
  "followers",
  "followerHistory",
  "impressions",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "reach",
  "engagementRate",
  "postCount",
];

export function AnalyticsPage() {
  const { locale } = useI18n();
  const copy = appCopy[locale].analytics;
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30d");

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <div role="tablist" aria-label={copy.period} className="flex rounded-md border border-border-strong p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "h-7 rounded px-2.5 text-xs transition-colors",
                  period === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {copy.periods[p]}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {(["followers", "impressions", "engagementRate", "postCount"] as const).map((key) => (
          <div key={key} className="bg-background p-4">
            <p className="text-xs text-muted-foreground">{copy.metrics[key]}</p>
            <p className="mt-2 font-mono text-2xl text-muted-foreground" aria-label={copy.noData}>
              —
            </p>
          </div>
        ))}
      </div>

      <section className="mt-12" aria-labelledby="availability-heading">
        <h2 id="availability-heading" className="text-sm font-medium">
          {copy.availability}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">{copy.availabilityBody}</p>
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{copy.metric}</th>
                {PLATFORMS.map((p) => (
                  <th key={p} className="px-4 py-2 font-medium">
                    {CAPABILITIES[p].displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {METRIC_ORDER.map((metric) => (
                <tr key={metric}>
                  <td className="px-4 py-2.5">{copy.metrics[metric]}</td>
                  {PLATFORMS.map((p) => {
                    const support = CAPABILITIES[p].metrics[metric];
                    return (
                      <td key={p} className="px-4 py-2.5" title={support.note}>
                        <Badge tone={AVAILABILITY_TONE[support.availability]}>
                          {copy.states[support.availability]}
                        </Badge>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

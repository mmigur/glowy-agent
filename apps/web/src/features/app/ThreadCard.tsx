import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import type { DraftRow, ThreadRow } from "./useThreads";

const LIMIT = 500;
const SOURCE_NOTE: Record<string, string> = {
  public_search: "Based on top-ranked public posts in your topics compared with recent ones.",
  own_posts: "Public search is not available yet, so this uses your own posts.",
  none: "No research data yet: these drafts come from your setup answers only.",
};
const TIME_NOTE: Record<string, string> = {
  own_posts: "Time chosen from when your own best posts went out.",
  research: "Time chosen from when top posts in your topics were published.",
  default: "Not enough data yet, so this is a typical high-activity window.",
};

/** datetime-local в часовом поясе браузера. */
function toInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const formatWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function DraftEditor({ draft, onSchedule }: { draft: DraftRow; onSchedule: (id: string, text: string, when: Date) => Promise<string | null> }) {
  const [text, setText] = useState(draft.text);
  const [when, setWhen] = useState(toInputValue(draft.recommended_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placeholders = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.trim());
  const length = [...text].length;
  const blocked = placeholders.length > 0 || length === 0 || length > LIMIT;

  async function submit() {
    setBusy(true);
    setError(null);
    const message = await onSchedule(draft.id, text, new Date(when));
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <div className="rounded-lg border border-border p-4">
      {draft.audience ? <Badge tone="muted">{draft.audience}</Badge> : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        aria-label="Post text"
        className="mt-3 w-full resize-y rounded-md border border-border-strong bg-background p-3 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className={cn(length > LIMIT && "text-foreground font-medium")}>{length} / {LIMIT}</span>
        {placeholders.length > 0 ? <span className="text-foreground">Fill in: {placeholders.map((p) => `[[${p}]]`).join(", ")}</span> : null}
      </div>
      {draft.rationale ? <p className="mt-3 text-sm text-muted-foreground">{draft.rationale}</p> : null}
      {draft.enhancements.length > 0 ? (
        <div className="mt-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Make it more viral with live content</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {draft.enhancements.map((e, i) => (
              <li key={i} className="flex gap-2">
                <Badge tone="muted" className="shrink-0 self-start">{e.type.replace(/_/g, " ")}</Badge>
                <span>{e.instruction}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label="Publish at"
          className="h-9 rounded-md border border-border-strong bg-background px-2 text-sm focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button size="sm" disabled={busy || blocked || !when} onClick={submit}>
          {busy ? "Scheduling…" : "Schedule this post"}
        </Button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-foreground">{error}</p> : null}
    </div>
  );
}

export function ThreadCard({ thread, onSchedule }: { thread: ThreadRow; onSchedule: (id: string, text: string, when: Date) => Promise<string | null> }) {
  const scheduled = thread.drafts.find((d) => d.status === "scheduled" || d.status === "published");
  const suggestions = thread.drafts.filter((d) => d.status === "suggested");

  return (
    <article className="rounded-xl border border-border-strong p-5">
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone={scheduled ? "solid" : "outline"}>{scheduled ? (scheduled.status === "published" ? "Published" : "Scheduled") : "Ready"}</Badge>
        <span className="text-xs text-muted-foreground">{new Date(thread.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      </header>

      {scheduled ? (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{scheduled.text}</p>
          {scheduled.recommended_at ? <p className="mt-3 text-xs text-muted-foreground">Goes out {formatWhen(scheduled.recommended_at)} unless you change it in Calendar.</p> : null}
        </>
      ) : (
        <>
          {thread.research_source ? <p className="mt-3 text-sm text-muted-foreground">{SOURCE_NOTE[thread.research_source]}</p> : null}
          {thread.patterns.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {thread.patterns.slice(0, 4).map((p) => (
                <li key={p.key}>
                  <Badge tone="muted" title={`${p.sampleSize} posts, ${p.confidence} confidence`}>{p.label} ×{p.lift.toFixed(1)}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          {thread.time_basis ? <p className="mt-3 text-xs text-muted-foreground">{TIME_NOTE[thread.time_basis]}</p> : null}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {suggestions.map((d) => <DraftEditor key={d.id} draft={d} onSchedule={onSchedule} />)}
          </div>
        </>
      )}
    </article>
  );
}

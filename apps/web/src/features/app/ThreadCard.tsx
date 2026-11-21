import { ChevronRight, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { tError } from "../../lib/app-copy";
import { fill, useI18n, type Locale } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import type { DraftRow, SourcePost, ThreadRow } from "./useThreads";

const LIMIT = 500;

/** datetime-local в часовом поясе браузера. */
function toInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "ru" ? "ru-RU" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function postCount(n: number, locale: Locale, words: { postOne: string; postFew: string; postMany: string }): string {
  if (locale === "en") return `${n} ${n === 1 ? words.postOne : words.postMany}`;
  const n10 = n % 10;
  const n100 = n % 100;
  const word = n10 === 1 && n100 !== 11 ? words.postOne : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? words.postFew : words.postMany;
  return `${n} ${word}`;
}

function DraftEditor({
  draft,
  onSchedule,
  onImage,
  tour,
  selected,
  onSelect,
}: {
  draft: DraftRow;
  onSchedule: (id: string, text: string, when: Date) => Promise<string | null>;
  onImage: (id: string, file: File | null) => Promise<string | null>;
  tour?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { locale, m } = useI18n();
  const copy = m.thread;
  const [text, setText] = useState(draft.text);
  const [when, setWhen] = useState(toInputValue(draft.recommended_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const placeholders = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]!.trim());
  const length = [...text].length;
  const blocked = placeholders.length > 0 || length === 0 || length > LIMIT;

  useEffect(() => {
    if (!draft.image_path || !supabase) {
      setPreview(null);
      return;
    }
    let active = true;
    void supabase.storage.from("post-images").createSignedUrl(draft.image_path, 3600).then(({ data }) => {
      if (active) setPreview(data?.signedUrl ?? null);
    });
    return () => {
      active = false;
    };
  }, [draft.image_path]);

  async function pickImage(file: File | null) {
    setImageBusy(true);
    setError(null);
    const message = await onImage(draft.id, file);
    setImageBusy(false);
    if (message) setError(message);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const message = await onSchedule(draft.id, text, new Date(when));
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-shadow",
        selected
          ? "border-[#16a34a] shadow-[0_0_0_3px_color-mix(in_srgb,#16a34a_28%,transparent)]"
          : "border-border hover:border-[#16a34a]/50",
      )}
      onClick={onSelect}
    >
      {draft.audience ? <Badge tone="muted">{draft.audience}</Badge> : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        aria-label={copy.postText}
        className="mt-3 w-full resize-y rounded-md border border-border-strong bg-background p-3 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className={cn(length > LIMIT && "text-foreground font-medium")}>{length} / {LIMIT}</span>
        {placeholders.length > 0 ? <span className="text-foreground">{copy.fillIn}: {placeholders.map((p) => `[[${p}]]`).join(", ")}</span> : null}
      </div>
      {draft.rationale ? <p className="mt-3 text-sm text-muted-foreground">{draft.rationale}</p> : null}
      {(draft.enhancements ?? []).length > 0 ? (
        <div className="mt-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{copy.viral}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {(draft.enhancements ?? []).map((e, i) => (
              <li key={i} className="flex gap-2">
                <Badge tone="muted" className="shrink-0 self-start">{e.type.replace(/_/g, " ")}</Badge>
                <span>{e.instruction}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={copy.attach}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (file) void pickImage(file);
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={imageBusy} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="size-4" aria-hidden /> {imageBusy ? copy.attaching : copy.attach}
        </Button>
        {preview ? (
          <span className="relative inline-flex">
            <img src={preview} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
            <button
              type="button"
              aria-label={copy.removeImage}
              className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background"
              onClick={() => void pickImage(null)}
            >
              <X className="size-3" />
            </button>
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label={copy.publishAt}
          className="h-9 rounded-md border border-border-strong bg-background px-2 text-sm focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button size="sm" data-tour={tour ? "schedule" : undefined} disabled={busy || blocked || !when} onClick={submit}>
          {busy ? copy.scheduling : copy.schedule}
        </Button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-foreground">{tError(error, locale)}</p> : null}
    </div>
  );
}

function SourceList({ posts, empty }: { posts: SourcePost[]; empty: boolean }) {
  const { locale, m } = useI18n();
  const copy = m.thread;
  const tag = locale === "ru" ? "ru-RU" : "en-US";
  const title = posts.length > 0 ? fill(copy.sourcesShow, { count: postCount(posts.length, locale, copy) }) : copy.sourcesLabel;

  return (
    <details className="group mt-4 rounded-lg border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        <span>{title}</span>
      </summary>
      <div className="border-t border-border">
        {posts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{empty ? copy.sourcesEmpty : copy.sourceNotes.none}</p>
        ) : (
          <ul className="divide-y divide-border">
            {posts.map((post) => (
              <li key={post.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{post.username ? `@${post.username}` : copy.anonymous}</span>
                  <Badge tone="muted">{post.origin === "own" ? copy.own : copy.public}</Badge>
                  {post.postedAt ? <time dateTime={post.postedAt}>{new Date(post.postedAt).toLocaleString(tag, { day: "numeric", month: "short" })}</time> : null}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed">{post.text}</p>
                {post.permalink ? (
                  <a href={post.permalink} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs underline underline-offset-4">
                    {copy.openThreads}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function ThreadCard({
  thread,
  onSchedule,
  onImage,
  onDiscard,
  onRegenerate,
  regenerateDisabled,
  tourSchedule,
}: {
  thread: ThreadRow;
  onSchedule: (id: string, text: string, when: Date) => Promise<string | null>;
  onImage: (id: string, file: File | null) => Promise<string | null>;
  onDiscard: (threadId: string) => Promise<string | null>;
  onRegenerate: () => Promise<void>;
  regenerateDisabled: boolean;
  tourSchedule?: boolean;
}) {
  const { locale, m } = useI18n();
  const copy = m.thread;
  const drafts = thread.drafts ?? [];
  const scheduled = drafts.find((d) => d.status === "scheduled" || d.status === "published");
  const suggestions = drafts.filter((d) => d.status === "suggested");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const statusLabel = scheduled ? (scheduled.status === "published" ? copy.published : copy.scheduled) : copy.ready;

  return (
    <article className="rounded-xl border border-border-strong p-5">
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone={scheduled ? "solid" : "outline"}>{statusLabel}</Badge>
        <span className="text-xs text-muted-foreground">{formatWhen(thread.created_at, locale)}</span>
      </header>

      {scheduled ? (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{scheduled.text}</p>
          {scheduled.recommended_at ? <p className="mt-3 text-xs text-muted-foreground">{fill(copy.goesOut, { when: formatWhen(scheduled.recommended_at, locale) })}</p> : null}
        </>
      ) : (
        <>
          {thread.research_source ? <p className="mt-3 text-sm text-muted-foreground">{copy.sourceNotes[thread.research_source]}</p> : null}
          {thread.patterns.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {thread.patterns.slice(0, 4).map((p) => (
                <li key={p.key}>
                  <Badge tone="muted" title={`${p.sampleSize} posts, ${p.confidence} confidence`}>{p.label} ×{p.lift.toFixed(1)}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          {thread.time_basis ? <p className="mt-3 text-xs text-muted-foreground">{copy.timeNotes[thread.time_basis]}</p> : null}
          <SourceList posts={thread.source_posts ?? []} empty={thread.research_source !== "none"} />
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {suggestions.map((d, index) => (
              <DraftEditor
                key={d.id}
                draft={d}
                onSchedule={onSchedule}
                onImage={onImage}
                tour={tourSchedule && index === 0}
                selected={selectedId === d.id}
                onSelect={() => setSelectedId(d.id)}
              />
            ))}
          </div>
          {suggestions.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={discarding}
                onClick={() => {
                  setDiscarding(true);
                  setActionError(null);
                  void onDiscard(thread.id).then((message) => {
                    setDiscarding(false);
                    if (message) setActionError(message);
                  });
                }}
              >
                {discarding ? copy.declining : copy.decline}
              </Button>
              <span className="text-xs text-muted-foreground">{copy.declineHint}</span>
              <Button type="button" size="sm" variant="outline" disabled={regenerateDisabled || discarding} onClick={() => void onRegenerate()}>
                {copy.regenerate}
              </Button>
              <span className="text-xs text-muted-foreground">{copy.regenerateHint}</span>
            </div>
          ) : null}
          {actionError ? <p role="alert" className="mt-3 text-sm">{tError(actionError, locale)}</p> : null}
        </>
      )}
    </article>
  );
}

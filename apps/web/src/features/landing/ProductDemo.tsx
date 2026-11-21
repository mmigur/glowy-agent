import { CalendarDays, ChevronRight, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { ActiveCheck } from "../../components/ActiveCheck";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { appCopy } from "../../lib/app-copy";
import { fill, useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";

type Screen = "today" | "calendar";
type Status = "draft" | "scheduled";

export function ProductDemo() {
  const { locale, m } = useI18n();
  const copy = appCopy[locale].demo;
  const cal = m.calendar;
  const thread = m.thread;
  const [screen, setScreen] = useState<Screen>("today");
  const [picked, setPicked] = useState<0 | 1>(0);
  const [scheduled, setScheduled] = useState(false);
  const [openSources, setOpenSources] = useState(false);
  const [showDraft, setShowDraft] = useState(true);
  const [showScheduled, setShowScheduled] = useState(true);

  const variants = [
    { audience: copy.audienceA, text: copy.textA },
    { audience: copy.audienceB, text: copy.textB },
  ];
  const sources = [
    { user: "@lena", text: copy.sourceA },
    { user: "@max", text: copy.sourceB },
  ];

  const tomorrow = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 30, 0, 0);
    return date;
  }, []);

  const items = [
    ...(showDraft ? [{ id: "draft", status: "draft" as Status, text: variants[picked === 0 ? 1 : 0]!.text }] : []),
    ...(scheduled && showScheduled ? [{ id: "scheduled", status: "scheduled" as Status, text: variants[picked]!.text }] : []),
  ];

  return (
    <figure id="demo" className="overflow-hidden rounded-xl border border-border-strong bg-background shadow-[0_24px_60px_-36px_rgba(0,0,0,0.45)]">
      <div className="flex h-[540px]">
        <aside className="flex w-[148px] shrink-0 flex-col border-r border-border bg-muted/40 p-3">
          <p className="px-2 pb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{m.landing.demo}</p>
          <DemoNav active={screen === "today"} icon={FileText} label={m.nav.today} onClick={() => setScreen("today")} />
          <DemoNav active={screen === "calendar"} icon={CalendarDays} label={m.nav.calendar} onClick={() => setScreen("calendar")} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium">{screen === "today" ? m.nav.today : m.nav.calendar}</span>
            <Badge tone="muted">{m.landing.example}</Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {screen === "today" ? (
              scheduled ? (
                <div>
                  <Badge tone="solid">{thread.scheduled}</Badge>
                  <p className="mt-3 text-sm leading-6">{variants[picked]!.text}</p>
                  <p className="mt-3 text-xs text-muted-foreground">{copy.scheduledBody}</p>
                  <Button size="sm" variant="outline" className="mt-4" onClick={() => setScreen("calendar")}>
                    {copy.seeCalendar}
                  </Button>
                </div>
              ) : (
                <div>
                  <Badge tone="outline">{thread.ready}</Badge>
                  <p className="mt-3 text-sm text-muted-foreground">{thread.sourceNotes.public_search}</p>
                  <button
                    type="button"
                    className="mt-3 flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm"
                    aria-expanded={openSources}
                    onClick={() => setOpenSources((v) => !v)}
                  >
                    <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", openSources && "rotate-90")} />
                    {fill(thread.sourcesShow, { count: locale === "ru" ? `${sources.length} поста` : `${sources.length} posts` })}
                  </button>
                  {openSources ? (
                    <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                      {sources.map((post) => (
                        <li key={post.user} className="px-3 py-2.5">
                          <p className="text-xs text-muted-foreground">{post.user}</p>
                          <p className="mt-1 text-sm leading-5">{post.text}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4 grid gap-3">
                    {variants.map((variant, index) => {
                      const active = picked === index;
                      return (
                        <button
                          key={variant.audience}
                          type="button"
                          onClick={() => setPicked(index as 0 | 1)}
                          className={cn(
                            "rounded-lg border p-3 text-left transition-colors",
                            active ? "border-foreground bg-muted" : "border-border hover:border-foreground/50",
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <Badge tone="muted">{variant.audience}</Badge>
                            {active ? <ActiveCheck /> : null}
                          </span>
                          <p className="mt-2 text-sm leading-6">{variant.text}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="muted">{copy.pattern}</Badge>
                    <Button size="sm" onClick={() => { setScheduled(true); setScreen("calendar"); }}>
                      {thread.schedule}
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div>
                <div className="flex flex-wrap gap-2">
                  <FilterChip label={cal.draft} count={1} pressed={showDraft} onClick={() => setShowDraft((v) => !v)} />
                  <FilterChip label={cal.scheduled} count={scheduled ? 1 : 0} pressed={showScheduled} onClick={() => setShowScheduled((v) => !v)} />
                </div>
                <p className="mt-4 text-sm font-medium capitalize">
                  {tomorrow.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", { month: "long", day: "numeric" })}
                </p>
                {items.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{scheduled ? cal.emptyFiltered : copy.emptyCalendar}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                    {items.map((item) => (
                      <li key={item.id} className="px-3 py-3">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {item.status === "scheduled" ? cal.scheduled : cal.draft}
                        </span>
                        <p className="mt-1.5 text-sm leading-6">{item.status === "draft" ? copy.draftBody : item.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <Button size="sm" variant="ghost" className="mt-3" onClick={() => setScreen("today")}>
                  {copy.backToday}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <figcaption className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{copy.caption}</figcaption>
    </figure>
  );
}

function DemoNav({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof FileText; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm",
        active ? "bg-background font-medium" : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function FilterChip({ label, count, pressed, onClick }: { label: string; count: number; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-7 rounded-md border px-2.5 font-mono text-[11px]",
        pressed ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted-foreground",
      )}
    >
      {label} {count}
    </button>
  );
}

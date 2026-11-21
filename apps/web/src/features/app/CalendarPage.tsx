import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/ui/button";
import { fill, useI18n } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { PageHeader } from "./PageHeader";
import { useCalendar, type CalendarItem, type CalendarStatus } from "./useCalendar";

const STATUS_ORDER: CalendarStatus[] = ["draft", "scheduled", "publishing", "published", "failed"];

function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarPage() {
  const { locale, m } = useI18n();
  const tag = locale === "ru" ? "ru-RU" : "en-US";
  const calendar = useCalendar();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<CalendarStatus>>(() => new Set());

  const labels: Record<CalendarStatus, string> = {
    draft: m.calendar.draft,
    scheduled: m.calendar.scheduled,
    publishing: m.calendar.publishing,
    published: m.calendar.published,
    failed: m.calendar.failed,
  };

  const items = calendar.data ?? [];
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = monthCells(year, month);
  const today = dayKey(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      if (hidden.has(item.status)) continue;
      const key = dayKey(new Date(item.at));
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items, hidden]);

  const monthKeys = new Set(cells.flatMap((day) => (day ? [dayKey(day)] : [])));
  const listed = selectedDay
    ? (byDay.get(selectedDay) ?? [])
    : [...byDay.entries()]
        .filter(([key]) => monthKeys.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([, dayItems]) => dayItems);

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(tag, { weekday: "short" }),
  );
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, items.filter((item) => item.status === status).length])) as Record<CalendarStatus, number>;
  const allHidden = STATUS_ORDER.every((status) => hidden.has(status));

  function toggle(status: CalendarStatus) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <>
      <PageHeader title={m.calendar.title} description={m.calendar.description} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{m.calendar.statuses}</span>
        {STATUS_ORDER.map((status) => {
          const on = !hidden.has(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(status)}
              className={cn(
                "h-7 rounded-md border px-2.5 font-mono text-[11px] font-medium transition-colors",
                on ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted-foreground hover:text-foreground",
              )}
            >
              {labels[status]}
              <span className={cn("ml-1.5", on ? "text-background/70" : "text-muted-foreground")}>{counts[status]}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <Button variant="ghost" size="sm" aria-label={m.calendar.prev} onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-sm font-medium capitalize">{cursor.toLocaleDateString(tag, { month: "long", year: "numeric" })}</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDay(dayKey(now)); }}>
              {m.calendar.today}
            </Button>
            <Button variant="ghost" size="sm" aria-label={m.calendar.next} onClick={() => setCursor(new Date(year, month + 1, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-border text-center text-[11px] uppercase tracking-wide text-muted-foreground">
          {weekdays.map((label) => (
            <div key={label} className="px-1 py-2">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="min-h-16 border-b border-r border-border bg-muted/40" />;
            const key = dayKey(day);
            const dayItems = byDay.get(key) ?? [];
            const selected = selectedDay === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(selected ? null : key)}
                aria-pressed={selected}
                className={cn(
                  "min-h-16 border-b border-r border-border p-1.5 text-left transition-colors hover:bg-muted",
                  selected && "bg-muted",
                )}
              >
                <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs", key === today && "bg-foreground text-background")}>
                  {day.getDate()}
                </span>
                {dayItems.length > 0 ? (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {dayItems.slice(0, 3).map((item) => (
                      <i key={item.id} className={cn("size-1.5 rounded-full", dotClass(item.status))} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        {calendar.loading ? (
          <p className="text-sm text-muted-foreground" role="status">{m.calendar.loading}</p>
        ) : calendar.error ? (
          <p role="alert" className="text-sm text-danger">{m.calendar.loadError}</p>
        ) : listed.length === 0 ? (
          <EmptyState title={m.calendar.emptyTitle} description={allHidden || hidden.size > 0 ? m.calendar.emptyFiltered : m.calendar.emptyAll} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {listed.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("rounded-md border px-1.5 py-0.5 font-mono", chipClass(item.status))}>{labels[item.status]}</span>
                  <time dateTime={item.at}>
                    {new Date(item.at).toLocaleString(tag, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{item.text || m.calendar.noText}</p>
                {item.status === "failed" && item.error ? (
                  <p className="mt-1 text-xs text-danger">{fill("{prefix}: {error}", { prefix: m.calendar.failedPrefix, error: item.error })}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function dotClass(status: CalendarStatus): string {
  if (status === "failed") return "bg-danger";
  if (status === "published") return "bg-[#16a34a]";
  if (status === "publishing") return "bg-foreground";
  if (status === "scheduled") return "bg-foreground";
  return "bg-muted-foreground";
}

function chipClass(status: CalendarStatus): string {
  if (status === "failed") return "border-danger text-danger";
  if (status === "published") return "border-[#16a34a] text-[#16a34a]";
  if (status === "scheduled" || status === "publishing") return "border-foreground text-foreground";
  return "border-border text-muted-foreground";
}

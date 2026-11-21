import { useCachedResource } from "../../lib/cache";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export type CalendarStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

export interface CalendarItem {
  id: string;
  status: CalendarStatus;
  at: string;
  text: string;
  error: string | null;
}

export function calendarCacheKey(userId: string): string {
  return `calendar:${userId}`;
}

const STATUSES = new Set<CalendarStatus>(["draft", "scheduled", "publishing", "published", "failed"]);

function isStatus(value: string): value is CalendarStatus {
  return STATUSES.has(value as CalendarStatus);
}

export function useCalendar() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const key = userId ? calendarCacheKey(userId) : null;

  return useCachedResource<CalendarItem[]>(key, async () => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const [publications, drafts] = await Promise.all([
      supabase
        .from("publications")
        .select("id, draft_id, status, scheduled_for, published_at, last_error")
        .neq("status", "cancelled")
        .order("scheduled_for", { ascending: false })
        .limit(200),
      supabase
        .from("drafts")
        .select("id, text, status, recommended_at, updated_at")
        .in("status", ["draft", "scheduled", "published"])
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);
    if (publications.error || drafts.error) throw new Error("Could not load the calendar.");

    const textByDraft = new Map<string, string>();
    for (const draft of drafts.data ?? []) {
      if (typeof draft.id === "string" && typeof draft.text === "string") textByDraft.set(draft.id, draft.text);
    }

    const items: CalendarItem[] = [];
    for (const row of publications.data ?? []) {
      if (typeof row.id !== "string" || typeof row.status !== "string" || !isStatus(row.status)) continue;
      if (row.status === "draft") continue;
      const at = row.status === "published" && row.published_at ? row.published_at : row.scheduled_for;
      if (typeof at !== "string") continue;
      items.push({
        id: row.id,
        status: row.status,
        at,
        text: typeof row.draft_id === "string" ? (textByDraft.get(row.draft_id) ?? "") : "",
        error: typeof row.last_error === "string" ? row.last_error : null,
      });
    }

    for (const draft of drafts.data ?? []) {
      if (draft.status !== "draft" || typeof draft.id !== "string" || typeof draft.text !== "string") continue;
      const at = draft.recommended_at ?? draft.updated_at;
      if (typeof at !== "string") continue;
      items.push({ id: draft.id, status: "draft", at, text: draft.text, error: null });
    }

    items.sort((a, b) => a.at.localeCompare(b.at));
    return items;
  }, 30_000);
}

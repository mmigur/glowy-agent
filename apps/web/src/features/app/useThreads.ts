import { FunctionsHttpError } from "@supabase/supabase-js";
import { useCallback } from "react";
import { invalidateCache, useCachedResource } from "../../lib/cache";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { calendarCacheKey } from "./useCalendar";

export interface Enhancement {
  type: string;
  instruction: string;
}

export interface DraftRow {
  id: string;
  text: string;
  audience: string | null;
  rationale: string | null;
  enhancements: Enhancement[];
  recommended_at: string | null;
  image_path: string | null;
  status: "suggested" | "draft" | "scheduled" | "rejected" | "published";
}

export interface PatternRow {
  key: string;
  label: string;
  lift: number;
  sampleSize: number;
  confidence: "low" | "medium" | "high";
}

export interface SourcePost {
  id: string;
  username: string | null;
  text: string;
  postedAt: string;
  permalink: string | null;
  origin: "public" | "own";
}

export interface ThreadRow {
  id: string;
  status: "running" | "ready" | "scheduled" | "failed";
  research_source: "public_search" | "own_posts" | "none" | null;
  pattern_basis: "top_vs_recent" | "own_engagement" | "none" | null;
  patterns: PatternRow[];
  source_posts: SourcePost[];
  recommended_at: string | null;
  time_basis: "own_posts" | "research" | "default" | null;
  created_at: string;
  drafts: DraftRow[];
}

export interface Usage {
  used: number;
  limit: number;
  resetsAt: string;
}

const DRAFT_FIELDS = "id, text, audience, rationale, enhancements, recommended_at, status";
const THREAD_COLUMNS =
  `id, status, research_source, pattern_basis, patterns, recommended_at, time_basis, created_at, drafts(${DRAFT_FIELDS})`;
const THREAD_COLUMNS_WITH_SOURCES = `${THREAD_COLUMNS.replace(DRAFT_FIELDS, `${DRAFT_FIELDS}, image_path`)}, source_posts`;

function asSourcePosts(raw: unknown): SourcePost[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.text !== "string") return [];
    return [{
      id: row.id,
      username: typeof row.username === "string" ? row.username : null,
      text: row.text,
      postedAt: typeof row.postedAt === "string" ? row.postedAt : "",
      permalink: typeof row.permalink === "string" ? row.permalink : null,
      origin: row.origin === "own" ? "own" : "public",
    } satisfies SourcePost];
  });
}

function withSources(rows: unknown[] | null, includeStored: boolean): ThreadRow[] {
  return (rows ?? []).map((row) => {
    const record = row as ThreadRow & { source_posts?: unknown };
    return {
      ...record,
      source_posts: includeStored ? asSourcePosts(record.source_posts) : [],
      drafts: (record.drafts ?? []).map((draft) => ({ ...draft, image_path: draft.image_path ?? null })),
    };
  });
}

/** Тексты ошибок функций и базы, понятные пользователю. */
const SCHEDULE_ERRORS: Record<string, string> = {
  P0400: "Fill in every [[placeholder]], keep the post under 500 characters and choose a time in the future.",
  P0404: "This post or its account is no longer available.",
  P0409: "This post is already scheduled.",
};

export function useThreads() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const threadsKey = userId ? `threads:${userId}` : null;
  const usageKey = userId ? `thread-usage:${userId}` : null;

  const threads = useCachedResource<ThreadRow[]>(threadsKey, async () => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const full = await supabase
      .from("agent_threads")
      .select(THREAD_COLUMNS_WITH_SOURCES)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(15);
    if (full.error && /source_posts|image_path/.test(full.error.message)) {
      const basic = await supabase
        .from("agent_threads")
        .select(THREAD_COLUMNS)
        .neq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(15);
      if (basic.error) throw new Error("Could not load your threads.");
      return withSources(basic.data, false);
    }
    if (full.error) throw new Error("Could not load your threads.");
    return withSources(full.data, true);
  });

  const usage = useCachedResource<Usage>(usageKey, async () => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.rpc("thread_usage");
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) throw new Error("Could not load the daily limit.");
    return { used: row.used, limit: row.daily_limit, resetsAt: row.resets_at };
  }, 60_000);

  const refreshAll = useCallback(async () => {
    if (threadsKey) invalidateCache(threadsKey);
    if (usageKey) invalidateCache(usageKey);
    await Promise.all([threads.reload(), usage.reload()]);
  }, [threadsKey, usageKey, threads, usage]);

  /** Запускает тред. Возвращает текст ошибки или null. */
  const runThread = useCallback(async (): Promise<string | null> => {
    if (!supabase) return "Supabase is not configured.";
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { error } = await supabase.functions.invoke("agent-thread-run", { body: { timezone } });
    if (error) {
      let message = "Could not reach the server. Try again.";
      if (error instanceof FunctionsHttpError) {
        try {
          const body: unknown = await error.context.json();
          if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
            message = body.error === "daily_limit_reached" ? "You have used all threads for today. The limit resets at midnight." : body.error;
          }
        } catch {
          // ответ не JSON
        }
      }
      await refreshAll();
      return message;
    }
    await refreshAll();
    return null;
  }, [refreshAll]);

  const setDraftImage = useCallback(
    async (draftId: string, file: File | null): Promise<string | null> => {
      if (!supabase || !userId) return "Supabase is not configured.";
      if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Use a JPEG, PNG or WebP image.";
      if (file && file.size > 8_000_000) return "The image must be under 8 MB.";
      const path = `${userId}/${draftId}`;
      if (file) {
        const uploaded = await supabase.storage.from("post-images").upload(path, file, { upsert: true, contentType: file.type });
        if (uploaded.error) return "Could not upload the image.";
      } else {
        await supabase.storage.from("post-images").remove([path]);
      }
      const saved = await supabase.from("drafts").update({ image_path: file ? path : null }).eq("id", draftId);
      if (saved.error) return "Could not save the image on this post.";
      if (threadsKey) invalidateCache(threadsKey);
      await threads.reload();
      return null;
    },
    [threads, threadsKey, userId],
  );

  const discardThread = useCallback(
    async (threadId: string): Promise<string | null> => {
      if (!supabase) return "Supabase is not configured.";
      const saved = await supabase.from("drafts").update({ status: "rejected" }).eq("thread_id", threadId).eq("status", "suggested");
      if (saved.error) return "Could not decline this generation.";
      if (threadsKey) invalidateCache(threadsKey);
      await threads.reload();
      return null;
    },
    [threads, threadsKey],
  );

  const scheduleDraft = useCallback(
    async (draftId: string, text: string, when: Date): Promise<string | null> => {
      if (!supabase) return "Supabase is not configured.";
      const saved = await supabase.from("drafts").update({ text }).eq("id", draftId);
      if (saved.error) return "Could not save your edits.";
      const { error } = await supabase.rpc("schedule_draft", { p_draft: draftId, p_when: when.toISOString() });
      if (error) return SCHEDULE_ERRORS[error.code ?? ""] ?? "Could not schedule the post.";
      if (threadsKey) invalidateCache(threadsKey);
      if (userId) invalidateCache(calendarCacheKey(userId));
      await threads.reload();
      return null;
    },
    [threads, threadsKey, userId],
  );

  return { threads, usage, runThread, scheduleDraft, setDraftImage, discardThread };
}

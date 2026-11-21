import { FunctionsHttpError } from "@supabase/supabase-js";
import { useCachedResource } from "../../lib/cache";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export interface InsightPoint {
  end: string;
  value: number;
}

export interface InsightsReport {
  username: string;
  days: number;
  since: string;
  until: string;
  views: { total: number; previous: number; series: InsightPoint[] };
  interactions: { total: number; previous: number; likes: number; replies: number; reposts: number; quotes: number };
  followers: number | null;
  clicks: number | null;
}

async function messageOf(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await error.context.json();
      if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
    } catch {
      // ответ не JSON
    }
  }
  return "Could not load Threads insights.";
}

export function useInsights(days: number) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const key = userId && days > 0 ? `insights:${userId}:${days}` : null;
  return useCachedResource<InsightsReport>(key, async () => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.functions.invoke<InsightsReport>("threads-insights", { body: { days } });
    if (error) throw new Error(await messageOf(error));
    if (!data) throw new Error("Could not load Threads insights.");
    return data;
  });
}

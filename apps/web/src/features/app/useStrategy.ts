import { answersToStrategyRow, strategyRowToAnswers, type OnboardingAnswers } from "@growth/core";
import { useCallback } from "react";
import { getCached, setCache, useCachedResource } from "../../lib/cache";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export type StrategyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; answers: OnboardingAnswers; completed: boolean; hasRow: boolean };

interface StrategyData {
  answers: OnboardingAnswers;
  completed: boolean;
  hasRow: boolean;
}

export function useStrategy() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const key = userId ? `strategy:${userId}` : null;

  const resource = useCachedResource<StrategyData>(key, async () => {
    if (!supabase || !userId) throw new Error("You are not signed in.");
    const { data, error } = await supabase
      .from("user_strategy")
      .select("role, topics, content_types, tone, goals, posting_frequency, formats, onboarding_completed_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Could not load your strategy.");
    return {
      answers: strategyRowToAnswers(data ?? {}),
      completed: Boolean(data?.onboarding_completed_at),
      hasRow: data !== null,
    };
  });

  const state: StrategyState = resource.data
    ? { status: "ready", ...resource.data }
    : resource.error
      ? { status: "error", message: resource.error }
      : { status: "loading" };

  const reload = resource.reload;

  /**
   * Сохраняет ответы. Метка завершения ставится только при complete: true и не сбрасывается
   * при последующем редактировании (колонка в запросе не передаётся). Возвращает текст ошибки.
   */
  const save = useCallback(
    async (answers: OnboardingAnswers, options: { complete?: boolean } = {}): Promise<string | null> => {
      if (!supabase || !userId) return "You are not signed in.";
      const { error } = await supabase.from("user_strategy").upsert(
        {
          user_id: userId,
          ...answersToStrategyRow(answers),
          ...(options.complete ? { onboarding_completed_at: new Date().toISOString() } : {}),
        },
        { onConflict: "user_id" },
      );
      if (error) return "Could not save your answers. Check your connection and try again.";
      // Сохранённое значение сразу кладём в кэш: перечитывать базу не нужно.
      const previous = key ? getCached<StrategyData>(key) : undefined;
      if (key) {
        setCache<StrategyData>(key, {
          answers,
          completed: Boolean(options.complete) || Boolean(previous?.completed),
          hasRow: true,
        });
      }
      return null;
    },
    [userId, key],
  );

  return { state, reload, save };
}

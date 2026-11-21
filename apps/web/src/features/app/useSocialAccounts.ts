import type { Platform } from "@growth/core";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useCallback } from "react";
import { useCachedResource } from "../../lib/cache";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export interface SocialAccountRow {
  id: string;
  platform: Platform;
  username: string;
  display_name: string | null;
  status: "active" | "needs_reauth" | "revoked";
  connected_at: string;
}

export type AccountsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; accounts: SocialAccountRow[] };

/** Достаёт понятное сообщение из ответа Edge Function ({ error: "..." }). */
async function functionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await error.context.json();
      if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
        return body.error;
      }
    } catch {
      // тело ответа не JSON
    }
  }
  return "Could not reach the server. Try again.";
}

const ACCOUNTS_KEY = (userId: string) => `accounts:${userId}`;

async function fetchAccounts(): Promise<SocialAccountRow[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("social_accounts")
    .select("id, platform, username, display_name, status, connected_at")
    .order("connected_at", { ascending: true });
  if (error) throw new Error("Could not load connected accounts.");
  return (data ?? []) as SocialAccountRow[];
}

export function useSocialAccounts() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const key = userId ? ACCOUNTS_KEY(userId) : null;
  const resource = useCachedResource(key, fetchAccounts);

  const state: AccountsState = resource.data
    ? { status: "ready", accounts: resource.data }
    : resource.error
      ? { status: "error", message: resource.error }
      : { status: "loading" };

  const reload = resource.reload;

  /** Возвращает текст ошибки. При успехе браузер уходит на страницу согласия Threads. */
  const connectThreads = useCallback(async (): Promise<string | null> => {
    if (!supabase) return "Supabase is not configured.";
    const { data, error } = await supabase.functions.invoke<{ url?: string }>("threads-connect-start");
    if (error) return functionErrorMessage(error);
    if (!data?.url) return "The server did not return an authorization link.";
    window.location.assign(data.url);
    return null;
  }, []);

  /** Отключает аккаунт: удаляется строка, токены удаляются каскадно. Возвращает текст ошибки. */
  const disconnect = useCallback(
    async (accountId: string): Promise<string | null> => {
      if (!supabase) return "Supabase is not configured.";
      const { error } = await supabase.from("social_accounts").delete().eq("id", accountId);
      if (error) return "Could not disconnect the account.";
      await reload();
      return null;
    },
    [reload],
  );

  return { state, reload, connectThreads, disconnect };
}

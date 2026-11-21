// GET /functions/v1/threads-oauth-callback
// Сюда Threads возвращает пользователя после согласия. Это адрес из Valid OAuth redirect URIs в Meta.
// Деплой БЕЗ проверки JWT (--no-verify-jwt): запрос приходит из браузера без токена приложения.
// Подлинность обеспечивает одноразовый state из таблицы oauth_states.
import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptSecret } from "../_shared/crypto.ts";
import { readEnv } from "../_shared/http.ts";
import {
  THREADS_SCOPES,
  ThreadsApiError,
  computeTokenTimes,
  exchangeCodeForShortToken,
  exchangeForLongLivedToken,
  fetchThreadsProfile,
} from "../_shared/threads.ts";

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "THREADS_APP_ID",
  "THREADS_APP_SECRET",
  "TOKEN_ENCRYPTION_KEY",
] as const;

function backToApp(appUrl: string, params: Record<string, string>): Response {
  return Response.redirect(`${appUrl}/app/settings?${new URLSearchParams(params)}`, 302);
}

Deno.serve(async (req) => {
  const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
  const url = new URL(req.url);

  if (url.searchParams.get("error")) return backToApp(appUrl, { connect_error: "denied" });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return backToApp(appUrl, { connect_error: "invalid" });

  const env = readEnv(REQUIRED, (n) => Deno.env.get(n));
  if (!env.ok) {
    console.error("threads-oauth-callback: missing secrets:", env.missing.join(", "));
    return backToApp(appUrl, { connect_error: "config" });
  }
  const v = env.values as Record<(typeof REQUIRED)[number], string>;
  const admin = createClient(v.SUPABASE_URL, v.SUPABASE_SERVICE_ROLE_KEY);

  // Атомарно «съедаем» state: повторное использование невозможно.
  const { data: stateRow } = await admin
    .from("oauth_states")
    .delete()
    .eq("state", state)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, platform")
    .maybeSingle();
  if (!stateRow || stateRow.platform !== "threads") return backToApp(appUrl, { connect_error: "state" });

  try {
    const redirectUri = `${v.SUPABASE_URL}/functions/v1/threads-oauth-callback`;
    const short = await exchangeCodeForShortToken(fetch, {
      appId: v.THREADS_APP_ID,
      appSecret: v.THREADS_APP_SECRET,
      redirectUri,
      code,
    });
    const long = await exchangeForLongLivedToken(fetch, { appSecret: v.THREADS_APP_SECRET, accessToken: short.accessToken });
    const profile = await fetchThreadsProfile(fetch, long.accessToken);

    // Один Threads-аккаунт нельзя привязать к двум пользователям.
    const { data: existing } = await admin
      .from("social_accounts")
      .select("id, user_id")
      .eq("platform", "threads")
      .eq("platform_user_id", profile.id)
      .maybeSingle();
    if (existing && existing.user_id !== stateRow.user_id) {
      return backToApp(appUrl, { connect_error: "account_taken" });
    }

    const { data: account, error: accountError } = await admin
      .from("social_accounts")
      .upsert(
        {
          user_id: stateRow.user_id,
          platform: "threads",
          platform_user_id: profile.id,
          username: profile.username,
          display_name: profile.name ?? null,
          avatar_url: profile.pictureUrl ?? null,
          status: "active",
          // Запрошенные права. Фактически выданные Threads в ответе обмена не возвращает.
          scopes: [...THREADS_SCOPES],
        },
        { onConflict: "platform,platform_user_id" },
      )
      .select("id")
      .single();
    if (accountError || !account) throw new Error(`Cannot save account: ${accountError?.message ?? "no row"}`);

    const times = computeTokenTimes(Date.now(), long.expiresInSec);
    const { error: tokenError } = await admin.from("social_tokens").upsert(
      {
        account_id: account.id,
        access_token_enc: await encryptSecret(long.accessToken, v.TOKEN_ENCRYPTION_KEY),
        refresh_token_enc: null,
        expires_at: times.expiresAt.toISOString(),
        refresh_after: times.refreshAfter.toISOString(),
      },
      { onConflict: "account_id" },
    );
    if (tokenError) throw new Error(`Cannot save token: ${tokenError.message}`);

    // В журнал пишем факт подключения, без токенов.
    await admin.from("agent_logs").insert({
      user_id: stateRow.user_id,
      account_id: account.id,
      action: "account.connected",
      input: { platform: "threads" },
      output: { username: profile.username },
    });

    return backToApp(appUrl, { connected: "threads" });
  } catch (err) {
    // Логируем только сообщение: в нём нет ни URL, ни токенов.
    const status = err instanceof ThreadsApiError ? ` (HTTP ${err.status})` : "";
    console.error(`threads-oauth-callback failed${status}:`, err instanceof Error ? err.message : "unknown error");
    return backToApp(appUrl, { connect_error: "exchange" });
  }
});

// POST /functions/v1/threads-deauthorize
// Meta вызывает этот адрес, когда пользователь отзывает доступ приложения в настройках Threads.
// Деплой БЕЗ проверки JWT: запрос приходит от Meta. Подлинность проверяется по подписи signed_request.
// Формат запроса взят из стандарта Meta (как у вызова удаления данных). Для Threads отдельно
// в документации не описан, поэтому проверь первый реальный вызов в логах функции.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, readEnv } from "../_shared/http.ts";
import { parseSignedRequest, readSignedRequest } from "../_shared/signed-request.ts";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "THREADS_APP_SECRET"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const env = readEnv(REQUIRED, (n) => Deno.env.get(n));
  if (!env.ok) {
    console.error("threads-deauthorize: missing secrets:", env.missing.join(", "));
    return json({ error: "Server is not configured" }, 500);
  }
  const v = env.values as Record<(typeof REQUIRED)[number], string>;

  const signedRequest = await readSignedRequest(req);
  const parsed = signedRequest ? await parseSignedRequest(signedRequest, v.THREADS_APP_SECRET) : null;
  if (!parsed) {
    console.error("threads-deauthorize: rejected a request with a missing or invalid signature");
    return json({ error: "Invalid signed_request" }, 400);
  }

  const admin = createClient(v.SUPABASE_URL, v.SUPABASE_SERVICE_ROLE_KEY);
  const { data: account } = await admin
    .from("social_accounts")
    .select("id, user_id")
    .eq("platform", "threads")
    .eq("platform_user_id", parsed.userId)
    .maybeSingle();

  // Повторный вызов или неизвестный аккаунт не ошибка: отвечаем успехом.
  if (account) {
    await admin.from("social_tokens").delete().eq("account_id", account.id);
    await admin.from("social_accounts").update({ status: "revoked" }).eq("id", account.id);
    await admin.from("agent_logs").insert({
      user_id: account.user_id,
      account_id: account.id,
      action: "account.deauthorized",
      input: { platform: "threads" },
    });
  }
  return json({ ok: true });
});

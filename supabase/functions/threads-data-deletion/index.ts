// POST /functions/v1/threads-data-deletion
// Meta вызывает этот адрес, когда пользователь просит удалить его данные. Ответ по документации Meta:
// JSON { url, confirmation_code }, где url ведёт на страницу статуса запроса.
// GET /functions/v1/threads-data-deletion?code=... показывает статус по коду.
// Деплой БЕЗ проверки JWT. Подлинность проверяется по подписи signed_request.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, readEnv } from "../_shared/http.ts";
import { parseSignedRequest, readSignedRequest } from "../_shared/signed-request.ts";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "THREADS_APP_SECRET"] as const;

function newConfirmationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function statusPage(message: string, status = 200): Response {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Data deletion</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">Data deletion</h1><p>${message}</p></body>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const env = readEnv(REQUIRED, (n) => Deno.env.get(n));
  if (!env.ok) {
    console.error("threads-data-deletion: missing secrets:", env.missing.join(", "));
    return json({ error: "Server is not configured" }, 500);
  }
  const v = env.values as Record<(typeof REQUIRED)[number], string>;
  const admin = createClient(v.SUPABASE_URL, v.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const code = new URL(req.url).searchParams.get("code") ?? "";
    if (!/^[0-9a-f]{24}$/.test(code)) return statusPage("This confirmation code is not valid.", 400);
    const { data } = await admin
      .from("agent_logs")
      .select("id")
      .eq("action", "data.deletion")
      .contains("output", { confirmation_code: code })
      .limit(1)
      .maybeSingle();
    return data
      ? statusPage("Your Threads data connected to this app has been deleted.")
      : statusPage("No deletion request was found for this code.", 404);
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const signedRequest = await readSignedRequest(req);
  const parsed = signedRequest ? await parseSignedRequest(signedRequest, v.THREADS_APP_SECRET) : null;
  if (!parsed) {
    console.error("threads-data-deletion: rejected a request with a missing or invalid signature");
    return json({ error: "Invalid signed_request" }, 400);
  }

  const { data: account } = await admin
    .from("social_accounts")
    .select("id, user_id")
    .eq("platform", "threads")
    .eq("platform_user_id", parsed.userId)
    .maybeSingle();

  // Удаление аккаунта каскадом убирает токены, публикации, метрики и снимки подписчиков.
  // Черновики пользователя остаются (это его собственные тексты), связь с аккаунтом обнуляется.
  if (account) {
    const { error } = await admin.from("social_accounts").delete().eq("id", account.id);
    if (error) {
      console.error("threads-data-deletion: delete failed:", error.message);
      return json({ error: "Deletion failed" }, 500);
    }
  }

  const code = newConfirmationCode();
  await admin.from("agent_logs").insert({
    user_id: account?.user_id ?? null,
    action: "data.deletion",
    input: { platform: "threads", found: Boolean(account) },
    output: { confirmation_code: code },
  });

  return json({
    url: `${v.SUPABASE_URL}/functions/v1/threads-data-deletion?code=${code}`,
    confirmation_code: code,
  });
});

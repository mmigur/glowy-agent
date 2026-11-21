// POST /functions/v1/publish-due   заголовок: x-cron-secret
// Берёт из очереди публикации, время которых пришло, и публикует их в Threads. Запускается по расписанию (см. supabase/cron.sql).
// Деплой БЕЗ проверки JWT: вызывает планировщик, доступ защищён общим секретом CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { json, readEnv } from "../_shared/http.ts";
import { ThreadsApiError } from "../_shared/threads.ts";
import { publishTextPost } from "../_shared/threads-content.ts";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TOKEN_ENCRYPTION_KEY", "CRON_SECRET"] as const;
const MAX_ATTEMPTS = 3;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const env = readEnv(REQUIRED, (n) => Deno.env.get(n));
  if (!env.ok) {
    console.error("publish-due: missing secrets:", env.missing.join(", "));
    return json({ error: "Server is not configured" }, 500);
  }
  const v = env.values as Record<(typeof REQUIRED)[number], string>;
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", v.CRON_SECRET)) return json({ error: "Forbidden" }, 403);

  const admin = createClient(v.SUPABASE_URL, v.SUPABASE_SERVICE_ROLE_KEY);
  const { data: claimed, error } = await admin.rpc("claim_due_publications", { batch_size: 10 });
  if (error) {
    console.error("publish-due: claim failed:", error.message);
    return json({ error: "Claim failed" }, 500);
  }

  let published = 0;
  let failed = 0;
  let retried = 0;
  for (const pub of (claimed ?? []) as { id: string; draft_id: string; account_id: string; attempts: number }[]) {
    try {
      const [{ data: draft }, { data: token }, { data: account }] = await Promise.all([
        admin.from("drafts").select("text").eq("id", pub.draft_id).maybeSingle(),
        admin.from("social_tokens").select("access_token_enc").eq("account_id", pub.account_id).maybeSingle(),
        admin.from("social_accounts").select("status").eq("id", pub.account_id).maybeSingle(),
      ]);
      if (!draft || !token || account?.status !== "active") throw new ThreadsApiError("Account or draft is no longer available", 410);
      if (/\[\[[^\]]+\]\]/.test(draft.text)) throw new ThreadsApiError("The post still has unfilled placeholders", 422);

      const accessToken = await decryptSecret(token.access_token_enc, v.TOKEN_ENCRYPTION_KEY);
      const { postId } = await publishTextPost(fetch, { accessToken, text: draft.text });
      await admin.from("publications").update({ status: "published", platform_post_id: postId, published_at: new Date().toISOString(), last_error: null }).eq("id", pub.id);
      await admin.from("drafts").update({ status: "published" }).eq("id", pub.draft_id);
      published++;
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 300) : "Unknown error";
      const status = e instanceof ThreadsApiError ? e.status : 0;
      // Ошибки, которые повтор не исправит: нет доступа, пост недоступен, токен недействителен.
      const permanent = [401, 403, 410, 422].includes(status);
      if (status === 401) await admin.from("social_accounts").update({ status: "needs_reauth" }).eq("id", pub.account_id);
      if (permanent || pub.attempts >= MAX_ATTEMPTS) {
        await admin.from("publications").update({ status: "failed", last_error: message }).eq("id", pub.id);
        failed++;
      } else {
        const delayMin = 5 * 2 ** (pub.attempts - 1);
        await admin.from("publications").update({ status: "scheduled", last_error: message, next_attempt_at: new Date(Date.now() + delayMin * 60_000).toISOString() }).eq("id", pub.id);
        retried++;
      }
      console.error("publish-due: publication", pub.id, "failed:", message);
    }
  }
  return json({ claimed: (claimed ?? []).length, published, retried, failed });
});

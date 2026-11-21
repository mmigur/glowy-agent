// POST /functions/v1/threads-connect-start
// Вызывается из приложения вошедшим пользователем. Создаёт одноразовый state и возвращает
// адрес окна согласия Threads. Деплой С проверкой JWT (по умолчанию).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, readEnv } from "../_shared/http.ts";
import { buildAuthorizeUrl, generateState } from "../_shared/threads.ts";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "THREADS_APP_ID"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const env = readEnv(REQUIRED, (n) => Deno.env.get(n));
  if (!env.ok) {
    console.error("threads-connect-start: missing secrets:", env.missing.join(", "));
    return json({ error: `Server is not configured. Missing secrets: ${env.missing.join(", ")}` }, 500);
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, THREADS_APP_ID } = env.values as Record<
    (typeof REQUIRED)[number],
    string
  >;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json({ error: "Not signed in" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const state = generateState();

  // Заодно чистим просроченные записи.
  await admin.from("oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error: insertError } = await admin
    .from("oauth_states")
    .insert({ state, user_id: data.user.id, platform: "threads" });
  if (insertError) {
    console.error("threads-connect-start: cannot store state:", insertError.message);
    return json({ error: "Could not start the connection. Try again." }, 500);
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/threads-oauth-callback`;
  return json({ url: buildAuthorizeUrl({ appId: THREADS_APP_ID, redirectUri, state }) });
});

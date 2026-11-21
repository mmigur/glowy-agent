// POST /functions/v1/threads-insights   тело: { days?: 7 | 14 | 30 | 90 }
// Отчёт профиля Threads за период: просмотры по дням, реакции, подписчики, демография.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { corsHeaders, json, readEnv } from "../_shared/http.ts";
import { ThreadsApiError } from "../_shared/threads.ts";
import { fetchAccountInsights, type InsightPoint } from "../_shared/threads-content.ts";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TOKEN_ENCRYPTION_KEY"] as const;
const DAY = 86_400;
const ALLOWED = new Set([7, 14, 30, 90]);

function numberOf(totals: Record<string, number>, name: string): number {
  return totals[name] ?? 0;
}

function sumNamed(totals: Record<string, number>, names: string[]): number {
  return names.reduce((sum, name) => sum + numberOf(totals, name), 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const env = readEnv(REQUIRED, (name) => Deno.env.get(name));
  if (!env.ok) return json({ error: `Server is not configured. Missing secrets: ${env.missing.join(", ")}` }, 500);
  const v = env.values as Record<(typeof REQUIRED)[number], string>;

  const userClient = createClient(v.SUPABASE_URL, v.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return json({ error: "Not signed in" }, 401);

  let body: { days?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // дни по умолчанию
  }
  const days = typeof body.days === "number" && ALLOWED.has(body.days) ? body.days : 30;

  const admin = createClient(v.SUPABASE_URL, v.SUPABASE_SERVICE_ROLE_KEY);
  const { data: account } = await admin
    .from("social_accounts")
    .select("id, username")
    .eq("user_id", auth.user.id)
    .eq("platform", "threads")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!account) return json({ error: "Connect a Threads account first." }, 400);

  const { data: tokenRow } = await admin.from("social_tokens").select("access_token_enc").eq("account_id", account.id).maybeSingle();
  if (!tokenRow) return json({ error: "The Threads connection has no token. Reconnect the account." }, 409);
  const accessToken = await decryptSecret(tokenRow.access_token_enc, v.TOKEN_ENCRYPTION_KEY);

  const until = Math.floor(Date.now() / 1000);
  const since = until - days * DAY;
  const previousSince = since - days * DAY;
  const reactionMetrics = "likes,replies,reposts,quotes";

  try {
    const [views, previousViews, reactions, previousReactions, followers, clicks] = await Promise.all([
      fetchAccountInsights(fetch, { accessToken, metric: "views", since, until }),
      fetchAccountInsights(fetch, { accessToken, metric: "views", since: previousSince, until: since }),
      fetchAccountInsights(fetch, { accessToken, metric: reactionMetrics, since, until }),
      fetchAccountInsights(fetch, { accessToken, metric: reactionMetrics, since: previousSince, until: since }),
      fetchAccountInsights(fetch, { accessToken, metric: "followers_count" }),
      fetchAccountInsights(fetch, { accessToken, metric: "clicks", since, until }).catch(() => null),
    ]);

    const reactionNames = ["likes", "replies", "reposts", "quotes"] as const;
    const series: InsightPoint[] = views.series.views ?? [];
    return json({
      username: account.username,
      days,
      since: new Date(since * 1000).toISOString(),
      until: new Date(until * 1000).toISOString(),
      views: { total: numberOf(views.totals, "views"), previous: numberOf(previousViews.totals, "views"), series },
      interactions: {
        total: sumNamed(reactions.totals, [...reactionNames]),
        previous: sumNamed(previousReactions.totals, [...reactionNames]),
        likes: numberOf(reactions.totals, "likes"),
        replies: numberOf(reactions.totals, "replies"),
        reposts: numberOf(reactions.totals, "reposts"),
        quotes: numberOf(reactions.totals, "quotes"),
      },
      followers: followers.totals.followers_count ?? null,
      clicks: clicks?.clicks ?? null,
    });
  } catch (error) {
    const message = error instanceof ThreadsApiError ? error.message : "Could not load Threads insights.";
    return json({ error: message }, error instanceof ThreadsApiError ? error.status : 502);
  }
});

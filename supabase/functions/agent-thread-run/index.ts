// POST /functions/v1/agent-thread-run   тело: { timezone?: string, accountId?: string }
// Один «тред»: исследование → паттерны → варианты поста → рекомендованное время. Деплой С проверкой JWT.
// Лимит в сутки занимает база (start_agent_thread). Если шаг упал, тред помечается failed и лимит не тратится.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import { corsHeaders, json, readEnv } from "../_shared/http.ts";
import { askLlm, LlmError, resolveLlmConfig } from "../_shared/llm.ts";
import { ThreadsApiError } from "../_shared/threads.ts";
import { engagementScore, fetchOwnPostsWithMetrics, isOwnOnly, keywordSearch, type FoundPost } from "../_shared/threads-content.ts";
import {
  buildThreadPrompt,   detectOwnEngagementPatterns, detectTopVsRecentPatterns, isValidTimeZone, nextSlot,
  parseVariantsReport, pickLikedPosts, queriesForTopics, rankHours, type DetectedPattern,
} from "../_shared/thread-logic.ts";

interface StoredSourcePost {
  id: string;
  username: string | null;
  text: string;
  postedAt: string;
  permalink: string | null;
  origin: "public" | "own";
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const chars = [...flat];
  return chars.length > 240 ? `${chars.slice(0, 239).join("")}…` : flat;
}

function toSource(
  post: { id: string; text: string; postedAt: string; username?: string | null; permalink?: string | null },
  origin: "public" | "own",
  fallbackUser?: string | null,
): StoredSourcePost {
  const username = post.username ?? fallbackUser ?? null;
  return {
    id: post.id,
    username,
    text: excerpt(post.text),
    postedAt: post.postedAt,
    permalink: post.permalink ?? (username ? `https://www.threads.net/@${username}` : null),
    origin,
  };
}

const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TOKEN_ENCRYPTION_KEY"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const env = readEnv(REQUIRED, (n) => Deno.env.get(n));
  if (!env.ok) {
    console.error("agent-thread-run: missing secrets:", env.missing.join(", "));
    return json({ error: `Server is not configured. Missing secrets: ${env.missing.join(", ")}` }, 500);
  }
  const v = env.values as Record<(typeof REQUIRED)[number], string>;
  const llm = resolveLlmConfig((n) => Deno.env.get(n));
  if (!llm) {
    console.error("agent-thread-run: no model key. Set ANTHROPIC_API_KEY, or LLM_API_KEY and LLM_MODEL.");
    return json({ error: "Server is not configured. Add a model key (ANTHROPIC_API_KEY, or LLM_API_KEY and LLM_MODEL)." }, 500);
  }
  const model = llm.model;

  const userClient = createClient(v.SUPABASE_URL, v.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return json({ error: "Not signed in" }, 401);
  const userId = auth.user.id;
  const admin = createClient(v.SUPABASE_URL, v.SUPABASE_SERVICE_ROLE_KEY);

  let body: { timezone?: unknown; accountId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // тело необязательно
  }

  // 1. Предусловия проверяем до того, как занять слот в лимите.
  const { data: strategy } = await admin.from("user_strategy").select("role, topics, content_types, tone, goals, formats, answers").eq("user_id", userId).maybeSingle();
  const queries = queriesForTopics(strategy?.topics ?? []);
  if (!strategy || queries.length === 0) return json({ error: "Answer the setup questions and pick at least one topic first." }, 400);

  let accountQuery = admin.from("social_accounts").select("id, username, status").eq("user_id", userId).eq("platform", "threads").eq("status", "active");
  if (typeof body.accountId === "string") accountQuery = accountQuery.eq("id", body.accountId);
  const { data: account } = await accountQuery.limit(1).maybeSingle();
  if (!account) return json({ error: "Connect a Threads account first." }, 400);

  if (typeof body.timezone === "string" && isValidTimeZone(body.timezone)) {
    await admin.from("profiles").update({ timezone: body.timezone }).eq("id", userId);
  }
  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const timeZone = profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : "UTC";

  // 2. Занимаем слот атомарно.
  const { data: threadId, error: slotError } = await userClient.rpc("start_agent_thread", { p_account: account.id });
  if (slotError) {
    if (slotError.code === "P0429") return json({ error: "daily_limit_reached" }, 429);
    console.error("agent-thread-run: slot error:", slotError.message);
    return json({ error: "Could not start a thread. Try again." }, 500);
  }

  const fail = async (message: string, status = 502) => {
    await admin.from("agent_threads").update({ status: "failed", error: message }).eq("id", threadId);
    return json({ error: message }, status);
  };

  try {
    const { data: tokenRow } = await admin.from("social_tokens").select("access_token_enc").eq("account_id", account.id).maybeSingle();
    if (!tokenRow) return await fail("The Threads connection has no token. Reconnect the account.", 409);
    const accessToken = await decryptSecret(tokenRow.access_token_enc, v.TOKEN_ENCRYPTION_KEY);

    // 3. Свои посты: часы публикации, что работает именно у пользователя, что не повторять.
    let own: Awaited<ReturnType<typeof fetchOwnPostsWithMetrics>> = [];
    try {
      own = await fetchOwnPostsWithMetrics(fetch, accessToken, 25);
    } catch (e) {
      console.error("agent-thread-run: own posts unavailable:", e instanceof Error ? e.message : e);
    }
    const ownScored = own.flatMap((p) => {
      const score = engagementScore(p);
      return score === null ? [] : [{ id: p.id, text: p.text, postedAt: p.postedAt, permalink: p.permalink, score }];
    });

    // 4. Публичное исследование: доступно только после одобрения права threads_keyword_search.
    const top: FoundPost[] = [];
    const recent: FoundPost[] = [];
    let publicAvailable = true;
    for (const q of queries) {
      try {
        const [t, r] = await Promise.all([
          keywordSearch(fetch, { accessToken, query: q, type: "TOP", limit: 25 }),
          keywordSearch(fetch, { accessToken, query: q, type: "RECENT", limit: 25 }),
        ]);
        if (isOwnOnly(t, account.username) || isOwnOnly(r, account.username)) {
          publicAvailable = false;
          break;
        }
        top.push(...t);
        recent.push(...r);
      } catch (e) {
        if (e instanceof ThreadsApiError && (e.status === 400 || e.status === 403)) {
          publicAvailable = false;
          break;
        }
        throw e;
      }
    }

    let source: "public_search" | "own_posts" | "none" = "none";
    let basis: "top_vs_recent" | "own_engagement" | "none" = "none";
    let patterns: DetectedPattern[] = [];
    let exemplars: string[] = [];
    let researchHours: number[] = [];
    let sourcePosts: StoredSourcePost[] = [];
    if (publicAvailable && top.length >= 8 && recent.length >= 8) {
      patterns = detectTopVsRecentPatterns(top.map((p) => p.text), recent.map((p) => p.text));
      basis = "top_vs_recent";
      source = "public_search";
      exemplars = top.slice(0, 6).map((p) => p.text);
      researchHours = rankHours(top.map((p) => ({ at: p.postedAt, weight: 1 })), timeZone);
      const seen = new Set<string>();
      for (const post of top) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        sourcePosts.push(toSource(post, "public"));
        if (sourcePosts.length === 8) break;
      }
    }
    if (source === "none" && ownScored.length > 0) {
      patterns = detectOwnEngagementPatterns(ownScored);
      basis = patterns.length ? "own_engagement" : "none";
      source = "own_posts";
      sourcePosts = [...ownScored]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((post) => toSource(post, "own", account.username));
    }
    const ownHours = rankHours(ownScored.map((p) => ({ at: p.postedAt, weight: p.score })), timeZone);

    // Посты 3–4-дневной давности с лайками: образец того, что уже зашло, а не то, что только что запланировали.
    const liked = pickLikedPosts(own, new Date());
    if (liked.length > 0) {
      const likedSources = liked.map((post) => toSource(post, "own", account.username));
      sourcePosts = [...likedSources, ...sourcePosts.filter((post) => !likedSources.some((item) => item.id === post.id))].slice(0, 8);
      exemplars = [...liked.map((post) => post.text), ...exemplars.filter((text) => !liked.some((post) => post.text === text))].slice(0, 6);
    }

    const { data: earlierDrafts } = await admin
      .from("drafts")
      .select("text")
      .eq("user_id", userId)
      .in("status", ["suggested", "draft", "scheduled", "published"])
      .order("created_at", { ascending: false })
      .limit(15);
    const avoid = [...new Set([
      ...(earlierDrafts ?? []).flatMap((row) => typeof row.text === "string" && row.text.trim() ? [row.text] : []),
      ...own.slice(0, 8).map((post) => post.text),
    ])];

    // 5. Варианты поста.
    const prompt = buildThreadPrompt({
      language: "English",
      strategy: {
        role: strategy.role, topics: strategy.topics,
        audience: Array.isArray(strategy.answers?.audience) ? strategy.answers.audience.filter((x: unknown) => typeof x === "string") : [],
        contentTypes: strategy.content_types, tone: strategy.tone, goals: strategy.goals, formats: strategy.formats,
      },
      patterns, patternBasis: basis, exemplars,
      avoid,
      variants: 3,
    });
    // Бесплатный роутер каждый раз выбирает случайную модель: часть отвечает пусто или не в том формате.
    // Поэтому до трёх попыток подряд.
    let variants: ReturnType<typeof parseVariantsReport>["variants"] = [];
    let lastLlmError = "";
    for (let attempt = 0; attempt < 3 && variants.length === 0; attempt++) {
      try {
        const report = parseVariantsReport(await askLlm(fetch, llm, prompt));
        variants = report.variants;
        if (!variants.length) {
          lastLlmError = report.reason;
          console.error(`agent-thread-run: attempt ${attempt + 1} unusable (model ${model}): ${report.reason}`);
        }
      } catch (e) {
        if (e instanceof LlmError) lastLlmError = e.message;
        else throw e;
      }
    }
    if (variants.length === 0) {
      return await fail(`The model did not return usable posts after 3 tries (model ${model}). Last problem: ${lastLlmError || "unknown"}. This thread was not counted.`);
    }

    // 6. Время: свои посты, затем исследование, затем типовые окна. Занятые слоты обходим.
    const { data: pending } = await admin.from("publications").select("scheduled_for").eq("user_id", userId).eq("status", "scheduled").gte("scheduled_for", new Date().toISOString());
    const slot = nextSlot({ now: new Date(), timeZone, ownHours, researchHours, taken: (pending ?? []).map((p) => new Date(p.scheduled_for)) });

    // 7. Сохраняем паттерны и короткие выдержки постов-источников (для раскрывающегося списка).
    const { data: drafts, error: draftError } = await admin.from("drafts").insert(
      variants.map((x) => ({
        user_id: userId, account_id: account.id, thread_id: threadId, text: x.text, audience: x.angle,
        rationale: x.rationale, enhancements: x.enhancements, recommended_at: slot.at.toISOString(), status: "suggested", model,
      })),
    ).select("id, text, audience, rationale, enhancements, recommended_at, status");
    if (draftError) throw new Error(draftError.message);

    const threadPatch = {
      status: "ready", research_source: source, pattern_basis: basis, patterns,
      recommended_at: slot.at.toISOString(), time_basis: slot.basis, source_posts: sourcePosts,
    };
    const updated = await admin.from("agent_threads").update(threadPatch).eq("id", threadId);
    if (updated.error && /source_posts/.test(updated.error.message)) {
      const { source_posts: _ignored, ...withoutSources } = threadPatch;
      const retry = await admin.from("agent_threads").update(withoutSources).eq("id", threadId);
      if (retry.error) throw new Error(retry.error.message);
    } else if (updated.error) {
      throw new Error(updated.error.message);
    }

    return json({
      thread: { id: threadId, researchSource: source, patternBasis: basis, patterns, recommendedAt: slot.at.toISOString(), timeBasis: slot.basis, timeZone },
      drafts,
    });
  } catch (e) {
    console.error("agent-thread-run failed:", e instanceof Error ? e.message : e);
    return await fail(e instanceof Error && e.message.startsWith("The model") ? e.message : "The thread failed. It was not counted, try again.");
  }
});

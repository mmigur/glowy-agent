// Чтение и публикация постов Threads: поиск, свои посты с метриками, создание поста.
// Адреса и поля сверены с документацией Meta (keyword search, media retrieval, publishing).
import { THREADS_GRAPH, ThreadsApiError, type FetchFn } from "./threads.ts";

async function readBody(res: Response): Promise<Record<string, unknown>> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // не JSON
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string"
        ? body.error.message
        : `Threads API returned HTTP ${res.status}`;
    throw new ThreadsApiError(msg, res.status);
  }
  if (typeof body !== "object" || body === null) throw new ThreadsApiError("Unexpected response from Threads API", 502);
  return body as Record<string, unknown>;
}

export interface FoundPost {
  id: string;
  text: string;
  postedAt: string;
  username: string | null;
  permalink: string | null;
}

/**
 * Поиск по ключевому слову. Требует одобренного права threads_keyword_search.
 * Без одобрения Meta возвращает только посты самого пользователя, поэтому такие ответы
 * вызывающий код должен отличать (см. isOwnOnly).
 * В ответе нет лайков и просмотров: у TOP-выдачи сигнал это порядок ранжирования.
 */
export async function keywordSearch(
  fetchFn: FetchFn,
  input: { accessToken: string; query: string; type: "TOP" | "RECENT"; limit?: number; sinceUnix?: number },
): Promise<FoundPost[]> {
  const url = new URL(`${THREADS_GRAPH}/v1.0/keyword_search`);
  url.searchParams.set("q", input.query);
  url.searchParams.set("search_type", input.type);
  url.searchParams.set("media_type", "TEXT");
  url.searchParams.set("limit", String(input.limit ?? 25));
  url.searchParams.set("fields", "id,text,timestamp,username,permalink");
  if (input.sinceUnix) url.searchParams.set("since", String(input.sinceUnix));
  url.searchParams.set("access_token", input.accessToken);
  const body = await readBody(await fetchFn(url));
  const data = Array.isArray(body.data) ? body.data : [];
  return data.flatMap((d: unknown): FoundPost[] => {
    if (typeof d !== "object" || d === null) return [];
    const r = d as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.text !== "string" || typeof r.timestamp !== "string") return [];
    return [{
      id: r.id,
      text: r.text,
      postedAt: r.timestamp,
      username: typeof r.username === "string" ? r.username : null,
      permalink: typeof r.permalink === "string" ? r.permalink : null,
    }];
  });
}

/** true, если все найденные посты принадлежат самому пользователю: публичный поиск не одобрен. */
export function isOwnOnly(posts: FoundPost[], ownUsername: string): boolean {
  return posts.length > 0 && posts.every((p) => p.username?.toLowerCase() === ownUsername.toLowerCase());
}

export interface OwnPostMetrics {
  id: string;
  permalink: string | null;
  text: string;
  postedAt: string;
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
}

/** Последние посты пользователя с метриками. Метрика, которую Threads не вернул, остаётся null (не 0). */
export async function fetchOwnPostsWithMetrics(fetchFn: FetchFn, accessToken: string, limit = 25): Promise<OwnPostMetrics[]> {
  const listUrl = new URL(`${THREADS_GRAPH}/v1.0/me/threads`);
  listUrl.searchParams.set("fields", "id,text,timestamp,media_type,permalink");
  listUrl.searchParams.set("limit", String(limit));
  listUrl.searchParams.set("access_token", accessToken);
  const list = await readBody(await fetchFn(listUrl));
  const items = (Array.isArray(list.data) ? list.data : []).flatMap((d: unknown) => {
    if (typeof d !== "object" || d === null) return [];
    const r = d as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.text === "string" && r.text.trim() && typeof r.timestamp === "string"
      ? [{ id: r.id, text: r.text, postedAt: r.timestamp, permalink: typeof r.permalink === "string" ? r.permalink : null }]
      : [];
  });

  return await Promise.all(
    items.map(async (it): Promise<OwnPostMetrics> => {
      const metrics: Record<string, number | null> = { views: null, likes: null, replies: null, reposts: null, quotes: null };
      try {
        const u = new URL(`${THREADS_GRAPH}/v1.0/${it.id}/insights`);
        u.searchParams.set("metric", "views,likes,replies,reposts,quotes");
        u.searchParams.set("access_token", accessToken);
        const body = await readBody(await fetchFn(u));
        for (const m of Array.isArray(body.data) ? body.data : []) {
          if (typeof m !== "object" || m === null) continue;
          const r = m as Record<string, unknown>;
          const values = Array.isArray(r.values) ? r.values : [];
          const v = typeof r.total_value === "object" && r.total_value !== null && "value" in r.total_value ? (r.total_value as { value: unknown }).value : (values[0] as { value?: unknown } | undefined)?.value;
          if (typeof r.name === "string" && r.name in metrics && typeof v === "number") metrics[r.name] = v;
        }
      } catch {
        // метрики этого поста недоступны, остаются null
      }
      return { id: it.id, permalink: it.permalink, text: it.text, postedAt: it.postedAt, views: metrics.views!, likes: metrics.likes!, replies: metrics.replies!, reposts: metrics.reposts!, quotes: metrics.quotes! };
    }),
  );
}

/** Нормированный скор: вовлечённость на просмотр. null, если метрик недостаточно. */
export function engagementScore(m: OwnPostMetrics): number | null {
  if (m.views === null || m.views < 20) return null;
  const weighted = (m.likes ?? 0) * 1 + (m.replies ?? 0) * 3 + (m.reposts ?? 0) * 2 + (m.quotes ?? 0) * 2;
  return weighted / m.views;
}

/** Публикует пост с картинкой. imageUrl должен быть доступен серверам Threads по HTTPS. */
export async function publishImagePost(fetchFn: FetchFn, input: { accessToken: string; text: string; imageUrl: string }): Promise<{ postId: string }> {
  const create = new URL(`${THREADS_GRAPH}/v1.0/me/threads`);
  const created = await readBody(
    await fetchFn(create, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ media_type: "IMAGE", image_url: input.imageUrl, text: input.text, access_token: input.accessToken }),
    }),
  );
  if (typeof created.id !== "string") throw new ThreadsApiError("Threads did not return a creation id", 502);
  const publish = new URL(`${THREADS_GRAPH}/v1.0/me/threads_publish`);
  const published = await readBody(
    await fetchFn(publish, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: created.id, access_token: input.accessToken }),
    }),
  );
  if (typeof published.id !== "string") throw new ThreadsApiError("Threads did not return a post id", 502);
  return { postId: published.id };
}

export interface InsightPoint {
  end: string;
  value: number;
}

export interface InsightSlice {
  label: string;
  value: number;
}

export interface AccountInsights {
  series: Record<string, InsightPoint[]>;
  totals: Record<string, number>;
  breakdown: InsightSlice[];
  clicks: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

/** Разбирает ответ /threads_insights: ряд по дням, суммы, разбивку и клики по ссылкам. */
export function parseAccountInsights(body: unknown): AccountInsights {
  const root = asRecord(body);
  const data = Array.isArray(root?.data) ? root.data : [];
  const series: Record<string, InsightPoint[]> = {};
  const totals: Record<string, number> = {};
  let breakdown: InsightSlice[] = [];
  let clicks = 0;

  for (const item of data) {
    const row = asRecord(item);
    if (!row || typeof row.name !== "string") continue;
    const values = Array.isArray(row.values) ? row.values : [];
    const points = values.flatMap((entry): InsightPoint[] => {
      const point = asRecord(entry);
      if (!point || typeof point.value !== "number" || typeof point.end_time !== "string") return [];
      return [{ end: point.end_time, value: point.value }];
    });
    if (points.length > 0) series[row.name] = points;

    const total = asRecord(row.total_value);
    if (total && typeof total.value === "number") totals[row.name] = total.value;
    else if (points.length > 0 && totals[row.name] === undefined) totals[row.name] = points.reduce((sum, point) => sum + point.value, 0);

    const breakdowns = Array.isArray(total?.breakdowns) ? total.breakdowns : [];
    const results = asRecord(breakdowns[0])?.results;
    if (Array.isArray(results)) {
      breakdown = results.flatMap((entry): InsightSlice[] => {
        const slice = asRecord(entry);
        const labels = Array.isArray(slice?.dimension_values) ? slice.dimension_values : [];
        const label = labels.find((part): part is string => typeof part === "string");
        if (!label || typeof slice?.value !== "number") return [];
        return [{ label, value: slice.value }];
      });
    } else if (total && asRecord(total.value)) {
      breakdown = Object.entries(total.value as Record<string, unknown>).flatMap(([label, value]): InsightSlice[] =>
        typeof value === "number" ? [{ label, value }] : [],
      );
    }

    const links = Array.isArray(row.link_total_values) ? row.link_total_values : [];
    for (const link of links) {
      const record = asRecord(link);
      if (record && typeof record.value === "number") clicks += record.value;
    }
  }

  return { series, totals, breakdown, clicks };
}

/** Читает метрики профиля. breakdown нужен только для follower_demographics. */
export async function fetchAccountInsights(
  fetchFn: FetchFn,
  input: { accessToken: string; metric: string; since?: number; until?: number; breakdown?: "country" | "city" | "age" | "gender" },
): Promise<AccountInsights> {
  const url = new URL(`${THREADS_GRAPH}/v1.0/me/threads_insights`);
  url.searchParams.set("metric", input.metric);
  if (input.since !== undefined) url.searchParams.set("since", String(input.since));
  if (input.until !== undefined) url.searchParams.set("until", String(input.until));
  if (input.breakdown) url.searchParams.set("breakdown", input.breakdown);
  url.searchParams.set("access_token", input.accessToken);
  return parseAccountInsights(await readBody(await fetchFn(url)));
}

/** Публикует текстовый пост: создаёт контейнер, затем публикует. Возвращает идентификатор поста. */
export async function publishTextPost(fetchFn: FetchFn, input: { accessToken: string; text: string }): Promise<{ postId: string }> {
  const create = new URL(`${THREADS_GRAPH}/v1.0/me/threads`);
  const created = await readBody(
    await fetchFn(create, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ media_type: "TEXT", text: input.text, access_token: input.accessToken }),
    }),
  );
  if (typeof created.id !== "string") throw new ThreadsApiError("Threads did not return a creation id", 502);
  const publish = new URL(`${THREADS_GRAPH}/v1.0/me/threads_publish`);
  const published = await readBody(
    await fetchFn(publish, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: created.id, access_token: input.accessToken }),
    }),
  );
  if (typeof published.id !== "string") throw new ThreadsApiError("Threads did not return a post id", 502);
  return { postId: published.id };
}

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
  url.searchParams.set("fields", "id,text,timestamp,username");
  if (input.sinceUnix) url.searchParams.set("since", String(input.sinceUnix));
  url.searchParams.set("access_token", input.accessToken);
  const body = await readBody(await fetchFn(url));
  const data = Array.isArray(body.data) ? body.data : [];
  return data.flatMap((d: unknown): FoundPost[] => {
    if (typeof d !== "object" || d === null) return [];
    const r = d as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.text !== "string" || typeof r.timestamp !== "string") return [];
    return [{ id: r.id, text: r.text, postedAt: r.timestamp, username: typeof r.username === "string" ? r.username : null }];
  });
}

/** true, если все найденные посты принадлежат самому пользователю: публичный поиск не одобрен. */
export function isOwnOnly(posts: FoundPost[], ownUsername: string): boolean {
  return posts.length > 0 && posts.every((p) => p.username?.toLowerCase() === ownUsername.toLowerCase());
}

export interface OwnPostMetrics {
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
  listUrl.searchParams.set("fields", "id,text,timestamp,media_type");
  listUrl.searchParams.set("limit", String(limit));
  listUrl.searchParams.set("access_token", accessToken);
  const list = await readBody(await fetchFn(listUrl));
  const items = (Array.isArray(list.data) ? list.data : []).flatMap((d: unknown) => {
    if (typeof d !== "object" || d === null) return [];
    const r = d as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.text === "string" && r.text.trim() && typeof r.timestamp === "string"
      ? [{ id: r.id, text: r.text, postedAt: r.timestamp }]
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
      return { text: it.text, postedAt: it.postedAt, views: metrics.views!, likes: metrics.likes!, replies: metrics.replies!, reposts: metrics.reposts!, quotes: metrics.quotes! };
    }),
  );
}

/** Нормированный скор: вовлечённость на просмотр. null, если метрик недостаточно. */
export function engagementScore(m: OwnPostMetrics): number | null {
  if (m.views === null || m.views < 20) return null;
  const weighted = (m.likes ?? 0) * 1 + (m.replies ?? 0) * 3 + (m.reposts ?? 0) * 2 + (m.quotes ?? 0) * 2;
  return weighted / m.views;
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

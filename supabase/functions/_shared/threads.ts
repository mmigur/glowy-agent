// Клиент OAuth Threads API. Адреса и параметры сверены с документацией Meta (19.11.2026):
//  - окно согласия: https://threads.com/oauth/authorize
//  - обмен кода: POST https://graph.threads.com/oauth/access_token
//  - долгий токен: GET https://graph.threads.com/access_token?grant_type=th_exchange_token
//  - профиль: GET https://graph.threads.com/v1.0/me

export const THREADS_AUTHORIZE_URL = "https://threads.com/oauth/authorize";
export const THREADS_GRAPH = "https://graph.threads.com";

/**
 * Запрашиваем только то, что нужно сейчас. Поиск по публичным постам (threads_keyword_search)
 * добавим после одобрения Meta: изменение набора прав потребует от пользователей переподключения.
 */
export const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"] as const;

export type FetchFn = typeof fetch;

export class ThreadsApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ThreadsApiError";
    this.status = status;
  }
}

export interface ThreadsProfile {
  id: string;
  username: string;
  name?: string;
  pictureUrl?: string;
}

export function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildAuthorizeUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(THREADS_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", THREADS_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  return url.toString();
}

/** Meta может дописать к коду суффикс "#_": он не часть кода. */
export function cleanAuthCode(code: string): string {
  return code.replace(/#_$/, "").trim();
}

function extractMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.error_message === "string") return b.error_message;
  if (typeof b.error === "object" && b.error !== null) {
    const m = (b.error as Record<string, unknown>).message;
    if (typeof m === "string") return m;
  }
  return null;
}

// В сообщения об ошибках не попадают URL и токены: они содержат секреты.
async function readJson(res: Response): Promise<Record<string, unknown>> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // тело не JSON
  }
  if (!res.ok) {
    throw new ThreadsApiError(extractMessage(body) ?? `Threads API returned HTTP ${res.status}`, res.status);
  }
  if (typeof body !== "object" || body === null) {
    throw new ThreadsApiError("Unexpected response from Threads API", 502);
  }
  return body as Record<string, unknown>;
}

export async function exchangeCodeForShortToken(
  fetchFn: FetchFn,
  input: { appId: string; appSecret: string; redirectUri: string; code: string },
): Promise<{ accessToken: string }> {
  const res = await fetchFn(`${THREADS_GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.appId,
      client_secret: input.appSecret,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
      code: cleanAuthCode(input.code),
    }),
  });
  const body = await readJson(res);
  // user_id из этого ответа намеренно не используем: это число больше безопасного целого JS
  // и при разборе JSON теряет точность. Идентификатор берём из профиля (строкой).
  if (typeof body.access_token !== "string") throw new ThreadsApiError("Token response has no access_token", 502);
  return { accessToken: body.access_token };
}

export async function exchangeForLongLivedToken(
  fetchFn: FetchFn,
  input: { appSecret: string; accessToken: string },
): Promise<{ accessToken: string; expiresInSec: number }> {
  const url = new URL(`${THREADS_GRAPH}/access_token`);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("access_token", input.accessToken);
  const body = await readJson(await fetchFn(url));
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new ThreadsApiError("Long-lived token response is incomplete", 502);
  }
  return { accessToken: body.access_token, expiresInSec: body.expires_in };
}

export async function fetchThreadsProfile(fetchFn: FetchFn, accessToken: string): Promise<ThreadsProfile> {
  const url = new URL(`${THREADS_GRAPH}/v1.0/me`);
  url.searchParams.set("fields", "id,username,name,threads_profile_picture_url");
  url.searchParams.set("access_token", accessToken);
  const body = await readJson(await fetchFn(url));
  if (typeof body.id !== "string" || typeof body.username !== "string") {
    throw new ThreadsApiError("Profile response is missing id or username", 502);
  }
  const profile: ThreadsProfile = { id: body.id, username: body.username };
  if (typeof body.name === "string") profile.name = body.name;
  if (typeof body.threads_profile_picture_url === "string") profile.pictureUrl = body.threads_profile_picture_url;
  return profile;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Токен живёт ~60 дней. Обновлять можно не раньше чем через сутки после выдачи,
 * планируем обновление за 10 дней до истечения (но не раньше чем через 25 часов).
 */
export function computeTokenTimes(nowMs: number, expiresInSec: number): { expiresAt: Date; refreshAfter: Date } {
  const expiresAt = new Date(nowMs + expiresInSec * 1000);
  const refreshAfterMs = Math.max(expiresAt.getTime() - 10 * DAY_MS, nowMs + 25 * 60 * 60 * 1000);
  return { expiresAt, refreshAfter: new Date(refreshAfterMs) };
}

import type { ProviderErrorKind } from "./provider";

export const MAX_PUBLISH_ATTEMPTS = 4;

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 30 * 60_000;

export function isRetryable(kind: ProviderErrorKind): boolean {
  return kind === "rate_limited" || kind === "transient";
}

/**
 * Задержка перед повтором публикации. attempt считается с 1 (номер уже сделанной попытки).
 * Если платформа сама указала Retry-After, уважаем его как минимум.
 */
export function nextRetryDelayMs(attempt: number, retryAfterSec?: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** Math.max(attempt - 1, 0), MAX_DELAY_MS);
  const fromHeader = retryAfterSec !== undefined ? retryAfterSec * 1000 : 0;
  return Math.max(exp, fromHeader);
}

export function shouldRetry(kind: ProviderErrorKind, attempt: number): boolean {
  return isRetryable(kind) && attempt < MAX_PUBLISH_ATTEMPTS;
}

/** Детерминированный ключ: одна и та же запись планировщика не может опубликоваться дважды. */
export function publicationKey(accountId: string, draftId: string, scheduledForIso: string): string {
  return `${accountId}:${draftId}:${scheduledForIso}`;
}

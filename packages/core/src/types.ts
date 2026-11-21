export const PLATFORMS = ["x", "threads"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type MetricKey =
  | "followers"
  | "followerHistory"
  | "likes"
  | "replies"
  | "reposts"
  | "quotes"
  | "impressions"
  | "reach"
  | "engagementRate"
  | "postCount";

/**
 * available   — подтверждено документацией и доступно без особых условий
 * conditional — доступно только при условии (оплата, App Review, свой аккаунт)
 * unavailable — API не отдаёт; можно только накапливать самим (снимки по дням)
 * unverified  — не подтверждено, нужно проверить в Phase 0 до использования
 */
export type Availability = "available" | "conditional" | "unavailable" | "unverified";

export interface MetricSupport {
  availability: Availability;
  note: string;
}

export interface PlatformCapabilities {
  platform: Platform;
  displayName: string;
  /** Лимит символов в одном посте (для X — бесплатный аккаунт без Premium). */
  maxChars: number;
  publish: MetricSupport;
  publicSearch: MetricSupport;
  metrics: Record<MetricKey, MetricSupport>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface RemoteProfile {
  platformUserId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface PublishInput {
  text: string;
  /** Для тредов: последующие части. */
  threadParts?: string[];
  /** Ключ идемпотентности: провайдер обязан проверить, не опубликовано ли уже. */
  idempotencyKey: string;
}

export interface PublishResult {
  platformPostId: string;
  publishedAt: Date;
}

export interface PostMetrics {
  platformPostId: string;
  capturedAt: Date;
  /** null = платформа не отдала значение. Никогда не подставляем 0 вместо «неизвестно». */
  impressions: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
}

export type SearchWindow = "24h" | "7d";

export interface SearchQuery {
  query: string;
  window: SearchWindow;
  cursor?: string;
  maxResults?: number;
}

export interface PublicPost {
  platformPostId: string;
  authorId: string;
  authorFollowers: number | null;
  postedAt: Date;
  /** Текст используется только для извлечения признаков и не сохраняется в БД. */
  text: string;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  impressions: number | null;
}

export interface SearchPage {
  posts: PublicPost[];
  nextCursor?: string;
  /** Оценка стоимости этой страницы в USD (для бюджета), если применимо. */
  estimatedCostUsd: number;
}

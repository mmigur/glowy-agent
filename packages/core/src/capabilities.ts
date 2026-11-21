import type { MetricKey, MetricSupport, Platform, PlatformCapabilities } from "./types";

/**
 * Матрица возможностей платформ на 19.11.2026.
 * Источник — обзоры по официальным документациям X и Meta. Это НЕ замена официальным
 * страницам: пункты со статусом "unverified" надо подтвердить в Phase 0 до использования.
 * UI обязан опираться на эту матрицу и не показывать метрики, которых API не отдаёт.
 */

const ok = (note: string): MetricSupport => ({ availability: "available", note });
const cond = (note: string): MetricSupport => ({ availability: "conditional", note });
const no = (note: string): MetricSupport => ({ availability: "unavailable", note });
const unk = (note: string): MetricSupport => ({ availability: "unverified", note });

export const CAPABILITIES: Record<Platform, PlatformCapabilities> = {
  x: {
    platform: "x",
    displayName: "X",
    maxChars: 280,
    publish: ok("Через официальный API, платно: $0.015 за пост, $0.20 если в посте есть ссылка."),
    publicSearch: cond("Поиск за последние 7 дней, платно: $0.005 за каждый прочитанный пост."),
    metrics: {
      followers: ok("Число подписчиков своего аккаунта."),
      followerHistory: no("API не отдаёт историю. Копим ежедневные снимки с момента подключения."),
      likes: ok("Для своих постов: $0.001 за чтение."),
      replies: ok("Для своих постов."),
      reposts: ok("Для своих постов."),
      quotes: ok("Для своих постов."),
      impressions: unk("Для своих постов, вероятно, доступно. Проверить в Phase 0."),
      reach: unk("Скорее всего недоступно. Проверить в Phase 0."),
      engagementRate: ok("Считаем сами из доступных метрик."),
      postCount: ok("Считаем по нашим публикациям."),
    },
  },
  threads: {
    platform: "threads",
    displayName: "Threads",
    maxChars: 500,
    publish: ok("Официальный API, бесплатно. До 250 постов за 24 часа на профиль."),
    publicSearch: cond(
      "Нужно разрешение threads_keyword_search (Meta App Review). Без него ищет только свои посты.",
    ),
    metrics: {
      followers: ok("Через insights аккаунта."),
      followerHistory: unk("Возможно частично через insights. Проверить в Phase 0."),
      likes: ok("Insights по посту."),
      replies: ok("Insights по посту."),
      reposts: ok("Insights по посту."),
      quotes: ok("Insights по посту."),
      impressions: ok("Просмотры (views) по посту."),
      reach: unk("Не подтверждено."),
      engagementRate: ok("Считаем сами из доступных метрик."),
      postCount: ok("Считаем по нашим публикациям."),
    },
  },
};

export const METRIC_LABELS: Record<MetricKey, string> = {
  followers: "Followers",
  followerHistory: "Follower history",
  likes: "Likes",
  replies: "Comments",
  reposts: "Reposts",
  quotes: "Quotes",
  impressions: "Impressions",
  reach: "Reach",
  engagementRate: "Engagement rate",
  postCount: "Posts",
};

export function metricSupport(platform: Platform, metric: MetricKey): MetricSupport {
  return CAPABILITIES[platform].metrics[metric];
}

/** Можно ли показывать метрику как реальное число (а не «н/д»). */
export function isMetricShowable(platform: Platform, metric: MetricKey): boolean {
  const a = metricSupport(platform, metric).availability;
  return a === "available" || a === "conditional";
}

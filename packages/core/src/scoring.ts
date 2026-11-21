/**
 * Скоринг популярности поста. Лайки сами по себе не показатель: учитываем вес типов
 * взаимодействий, возраст поста и размер автора. Если платформа не отдала нужные данные,
 * честно помечаем основу расчёта (`basis`), а не выдаём приближение за точное значение.
 */

export interface ScoringInput {
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  impressions?: number | null;
  ageHours: number;
  authorFollowers?: number | null;
}

/** Ответы и репосты сильнее лайков: это более «дорогое» действие. Стартовые веса, калибруются по данным. */
export const ENGAGEMENT_WEIGHTS = { like: 1, reply: 3, repost: 2, quote: 2 } as const;

/** Посты младше этого возраста не ранжируем уверенно: метрики ещё не устоялись. */
export const MIN_RELIABLE_AGE_HOURS = 1;

export type ScoreBasis = "impressions" | "followers" | "raw";

export interface PostScore {
  weightedEngagement: number;
  /** Нормированная вовлечённость: основа задана в `basis`. */
  normalized: number;
  basis: ScoreBasis;
  /** Взвешенная вовлечённость в час (со сглаживанием для свежих постов). */
  velocityPerHour: number;
  tooFresh: boolean;
}

export function weightedEngagement(
  m: Pick<ScoringInput, "likes" | "replies" | "reposts" | "quotes">,
): number {
  return (
    m.likes * ENGAGEMENT_WEIGHTS.like +
    m.replies * ENGAGEMENT_WEIGHTS.reply +
    m.reposts * ENGAGEMENT_WEIGHTS.repost +
    m.quotes * ENGAGEMENT_WEIGHTS.quote
  );
}

export function scorePost(input: ScoringInput): PostScore {
  const weighted = weightedEngagement(input);
  const age = Math.max(input.ageHours, 0);

  let normalized: number;
  let basis: ScoreBasis;

  if (input.impressions != null && input.impressions > 0) {
    normalized = weighted / input.impressions;
    basis = "impressions";
  } else if (input.authorFollowers != null && input.authorFollowers >= 0) {
    // Корень смягчает перекос в пользу крупных аккаунтов, но не убирает его полностью.
    normalized = weighted / Math.sqrt(Math.max(input.authorFollowers, 25));
    basis = "followers";
  } else {
    normalized = weighted;
    basis = "raw";
  }

  return {
    weightedEngagement: weighted,
    normalized,
    basis,
    velocityPerHour: weighted / (age + 2),
    tooFresh: age < MIN_RELIABLE_AGE_HOURS,
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export type Confidence = "low" | "medium" | "high";

export interface PatternLift {
  /** Во сколько раз медиана паттерна выше медианы ниши. null, если сравнить нельзя. */
  lift: number | null;
  sampleSize: number;
  confidence: Confidence;
}

export const CONFIDENCE_THRESHOLDS = { medium: 10, high: 30 } as const;

export function confidenceForSample(n: number): Confidence {
  if (n >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (n >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

/**
 * Сравнивает медиану нормированных скоров постов с паттерном и медиану по всей нише.
 * Малая выборка помечается как low: UI показывает это пользователю.
 */
export function computePatternLift(patternScores: number[], nicheScores: number[]): PatternLift {
  const nicheMedian = median(nicheScores);
  const sampleSize = patternScores.length;
  if (sampleSize === 0 || nicheMedian <= 0) {
    return { lift: null, sampleSize, confidence: "low" };
  }
  return {
    lift: median(patternScores) / nicheMedian,
    sampleSize,
    confidence: confidenceForSample(sampleSize),
  };
}
